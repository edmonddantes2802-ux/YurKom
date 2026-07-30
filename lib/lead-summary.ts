/**
 * ИИ-классификация заявки с формы для сводки в рабочем чате.
 *
 * Разовая классификация, НЕ диалог: своя короткая система-промпт
 * (`LEAD_SUMMARY_SYSTEM_PROMPT` в `lib/ai-config.ts`), без истории, без
 * квоты — `/api/lead` уже ограничен rate limit'ом по IP, отдельный лимит
 * здесь не нужен. Anthropic-клиент общий с ботом (`lib/ai.ts`), таймаут
 * свой — короче, чем у бота, задаётся вторым аргументом запроса.
 *
 * Контракт мягкий, в отличие от `lib/ai.ts`: функция НИКОГДА не бросает
 * исключений, любой сбой — `null`. `/api/lead` в этом случае просто не
 * добавляет сводку и отправляет заявку как раньше, сырым текстом; клиент и
 * команда разницы не замечают.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getClient, isRetryableAnthropicError } from '@/lib/ai';
import {
  AI_MAX_ATTEMPTS,
  AI_MODEL,
  AI_RETRY_DELAYS_MS,
  LEAD_DIRECTION_LABELS,
  LEAD_SUMMARY_MAX_TOKENS,
  LEAD_SUMMARY_SCHEMA,
  LEAD_SUMMARY_SYSTEM_PROMPT,
  LEAD_SUMMARY_TIMEOUT_MS,
} from '@/lib/ai-config';
import { sanitizeText } from '@/lib/validation';
import { withRetry } from '@/lib/retry';

export type LeadSummary = {
  /** Слаг направления либо `unknown`. */
  direction: string;
  /** Человекочитаемое название для текста в Telegram. */
  directionLabel: string;
  urgency: string;
  summary: string;
};

/** Лог классификации. `via` — `ai_summary` (сработало) или `fallback` (сбой, причина в `reason`). */
function logLeadSummary(fields: Record<string, unknown>): void {
  console.error('LEAD_SUMMARY', JSON.stringify(fields));
}

type ParsedSummary = { direction?: unknown; urgency?: unknown; summary?: unknown };

export async function summarizeLead(situation: string): Promise<LeadSummary | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logLeadSummary({ via: 'fallback', reason: 'ANTHROPIC_API_KEY is not configured' });
    return null;
  }

  const startedAt = Date.now();
  let response;
  try {
    response = await withRetry(
      async () => {
        // Та же логика бюджета, что и у бота (lib/ai.ts): вторая попытка
        // получает остаток LEAD_SUMMARY_TIMEOUT_MS, а не полный таймаут заново.
        const remaining = LEAD_SUMMARY_TIMEOUT_MS - (Date.now() - startedAt);
        if (remaining <= 0) {
          throw new Anthropic.APIConnectionError({ message: 'no time left in retry budget' });
        }
        return await getClient(apiKey).messages.create(
          {
            model: AI_MODEL,
            max_tokens: LEAD_SUMMARY_MAX_TOKENS,
            // Классификация из трёх коротких полей — глубина мышления не нужна,
            // а при небольшом max_tokens она бы съела лимит (см. lib/ai.ts).
            thinking: { type: 'disabled' },
            output_config: {
              effort: 'low',
              format: { type: 'json_schema', schema: LEAD_SUMMARY_SCHEMA },
            },
            system: [
              {
                type: 'text',
                text: LEAD_SUMMARY_SYSTEM_PROMPT,
                cache_control: { type: 'ephemeral' },
              },
            ],
            // Текст заявки — отдельный пользовательский блок, не часть промпта.
            messages: [{ role: 'user', content: situation }],
          },
          // Свой таймаут короче, чем у бота: заявка не должна ждать классификацию
          // дольше, чем нужно, — она и так готова уйти сырым текстом.
          { timeout: Math.min(LEAD_SUMMARY_TIMEOUT_MS, remaining) },
        );
      },
      { attempts: AI_MAX_ATTEMPTS, delaysMs: AI_RETRY_DELAYS_MS, isRetryable: isRetryableAnthropicError },
      (attempt, attempts, err, delay) => {
        const reason = err instanceof Error ? `${err.name}: ${err.message}` : 'unknown error';
        logLeadSummary({ via: 'retry', attempt, attempts, reason, nextDelayMs: delay });
      },
    );
  } catch (err) {
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : 'unknown error';
    logLeadSummary({ via: 'fallback', reason, ms: Date.now() - startedAt });
    return null;
  }

  const ms = Date.now() - startedAt;
  const usage = {
    input: response.usage.input_tokens,
    output: response.usage.output_tokens,
    cacheRead: response.usage.cache_read_input_tokens ?? 0,
    // См. lib/ai.ts: без этого поля запись кэша системного промпта выглядит
    // в логе как «промпт не ушёл в запрос», хотя он просто оплачен иначе.
    cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
  };

  // Классификаторы модели могут отклонить запрос: HTTP 200, stop_reason
  // refusal, пустой content — читать content[0] без проверки нельзя.
  if (response.stop_reason === 'refusal') {
    logLeadSummary({ via: 'fallback', reason: 'model refused to answer', ms, usage });
    return null;
  }

  const raw = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  let parsed: ParsedSummary;
  try {
    parsed = JSON.parse(raw);
  } catch {
    logLeadSummary({ via: 'fallback', reason: 'invalid JSON from model', ms, usage, raw: raw.slice(0, 200) });
    return null;
  }

  if (
    typeof parsed.direction !== 'string' ||
    typeof parsed.urgency !== 'string' ||
    typeof parsed.summary !== 'string' ||
    !parsed.summary.trim()
  ) {
    logLeadSummary({ via: 'fallback', reason: 'unexpected shape from model', ms, usage });
    return null;
  }

  const direction = parsed.direction;
  const directionLabel = LEAD_DIRECTION_LABELS[direction] ?? direction;
  // Схема гарантирует тип строки, не длину. Сообщение уходит в Telegram
  // plain-текстом — чистим так же, как любой другой контент в чате.
  const summary = sanitizeText(parsed.summary, 500);

  if (!summary) {
    logLeadSummary({ via: 'fallback', reason: 'summary empty after sanitize', ms, usage });
    return null;
  }

  logLeadSummary({ via: 'ai_summary', ms, usage, direction, urgency: parsed.urgency });

  return { direction, directionLabel, urgency: parsed.urgency, summary };
}
