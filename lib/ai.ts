/**
 * ИИ-ответ бота-секретаря.
 *
 * ИИ здесь — НЕОБЯЗАТЕЛЬНОЕ звено. Контракт с `lib/bot-reply.ts` жёсткий:
 * функция либо возвращает текст ответа, либо бросает исключение. Всё остальное
 * (таймаут 8 секунд, ошибки, пустой ответ) обрабатывает деградация — клиент в
 * любом случае получает ответ, в худшем случае шаблон.
 *
 * Поэтому каждая «штатная причина не отвечать» — не настроен ключ, исчерпана
 * квота, ответ зарезан постфильтром — это тоже исключение (`AiSkip`): так в
 * логе BOT_REPLY видна конкретная причина, а не безликое «пусто».
 *
 * Ключ берётся ТОЛЬКО из `ANTHROPIC_API_KEY`. В коде и в git его нет.
 * Не задан → бот работает на шаблоне, ничего не падает.
 *
 * Защита от prompt injection выстроена в три слоя:
 *   1. сообщение клиента уходит отдельным пользовательским блоком и никогда не
 *      подмешивается в системный промпт;
 *   2. системный промпт прямо объявляет пользовательский текст данными;
 *   3. постфильтр по стоп-паттернам режет ответ, если модель всё-таки пообещала
 *      исход, назвала цену или статью как руководство к действию.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  AI_MAX_TOKENS,
  AI_MODEL,
  AI_REQUEST_TIMEOUT_MS,
  SUMMARY_MARKER,
  SYSTEM_PROMPT,
  findStopPattern,
} from '@/lib/ai-config';
import { consumeQuota, getHistory, putSummary, rememberExchange } from '@/lib/ai-memory';

export type AiReplyInput = {
  /** Текст сообщения клиента. */
  text: string;
  /** Чат клиента: по нему живут контекст диалога и квота. */
  chatId: string;
};

export type AiReply = (input: AiReplyInput) => Promise<string>;

/** Каким путём закончилась попытка ответить — уходит в лог AI_REPLY. */
export type AiRoute = 'ai' | 'disabled' | 'quota' | 'filtered' | 'refusal' | 'empty' | 'error';

/** Штатный отказ отвечать: деградация в `bot-reply` переведёт бота на шаблон. */
class AiSkip extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiSkip';
  }
}

/**
 * Лог каждого ответа модели. Пишем в stderr: в логах контейнера Coolify видно
 * `console.error`, а `console.log` из роутов — нет.
 */
function logAi(fields: { via: AiRoute; chatId: string } & Record<string, unknown>): void {
  console.error('AI_REPLY', JSON.stringify(fields));
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Клиент создаётся лениво: на этапе сборки переменных окружения нет, а
 * конструктор SDK без ключа бросает исключение.
 *
 * `maxRetries: 0` — ретраи всё равно не уложатся во внешние 8 секунд и лишь
 * добавят оплаченных токенов, которых никто не увидит.
 */
let client: Anthropic | null = null;
function getClient(apiKey: string): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey, timeout: AI_REQUEST_TIMEOUT_MS, maxRetries: 0 });
  }
  return client;
}

/**
 * Отделяет служебную сводку от текста, который увидит клиент.
 * Строка со сводкой может прийти где угодно — вырезаем все совпадения.
 */
export function splitSummary(raw: string): { reply: string; summary?: string } {
  const lines = raw.split('\n');
  const summaryLines = lines.filter((line) => line.trimStart().startsWith(SUMMARY_MARKER));
  if (summaryLines.length === 0) return { reply: raw.trim() };

  const reply = lines
    .filter((line) => !line.trimStart().startsWith(SUMMARY_MARKER))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const summary = summaryLines
    .map((line) => line.trim().slice(SUMMARY_MARKER.length).trim())
    .filter(Boolean)
    .join('\n');

  return { reply, summary: summary || undefined };
}

export const aiReply: AiReply = async ({ text, chatId }) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logAi({ via: 'disabled', chatId, reason: 'ANTHROPIC_API_KEY is not configured' });
    throw new AiSkip('ANTHROPIC_API_KEY is not configured');
  }

  const quota = consumeQuota(chatId);
  if (!quota.allowed) {
    logAi({ via: 'quota', chatId, used: quota.used, limit: quota.limit });
    throw new AiSkip(`quota exceeded: ${quota.used}/${quota.limit} per hour`);
  }

  const history = getHistory(chatId);
  const startedAt = Date.now();

  let response;
  try {
    response = await getClient(apiKey).messages.create({
      model: AI_MODEL,
      max_tokens: AI_MAX_TOKENS,
      // Мышление выключено осознанно: при max_tokens 400 оно съело бы лимит и
      // обрезало ответ. Глубина здесь не нужна — бот задаёт уточняющий вопрос.
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          // Промпт неизменен от запроса к запросу — кешируем: он крупнее самого
          // диалога и иначе оплачивался бы полностью на каждое сообщение.
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        ...history.map((turn) => ({ role: turn.role, content: turn.text })),
        // Сообщение клиента — отдельный пользовательский блок, не часть промпта.
        { role: 'user' as const, content: text },
      ],
    });
  } catch (err) {
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : 'unknown error';
    logAi({ via: 'error', chatId, reason, ms: Date.now() - startedAt });
    throw err;
  }

  const ms = Date.now() - startedAt;
  const usage = {
    input: response.usage.input_tokens,
    output: response.usage.output_tokens,
    cacheRead: response.usage.cache_read_input_tokens ?? 0,
  };

  // Классификаторы модели могут отклонить запрос: это HTTP 200 со stop_reason
  // refusal и пустым content — читать content[0] без проверки нельзя.
  if (response.stop_reason === 'refusal') {
    logAi({ via: 'refusal', chatId, ms, usage, details: response.stop_details ?? undefined });
    throw new AiSkip('model refused to answer');
  }

  const raw = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  const { reply, summary } = splitSummary(raw);

  if (!reply) {
    logAi({ via: 'empty', chatId, ms, usage, stopReason: response.stop_reason });
    throw new AiSkip('model returned empty text');
  }

  const matched = findStopPattern(reply);
  if (matched) {
    // Ответ не отправляем целиком: вырезать «плохой» кусок нельзя — вместе с
    // ним потеряется смысл фразы, а клиент получит обрывок.
    logAi({ via: 'filtered', chatId, ms, usage, pattern: matched, text: reply });
    throw new AiSkip(`filtered by stop pattern ${matched}`);
  }

  if (summary) putSummary(chatId, summary);
  rememberExchange(chatId, text, reply);

  logAi({
    via: 'ai',
    chatId,
    ms,
    usage,
    stopReason: response.stop_reason,
    hasSummary: Boolean(summary),
    text: reply,
  });

  return reply;
};
