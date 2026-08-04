/**
 * Память бота: контекст диалога, квота обращений к API и служебные сводки.
 *
 * Хранение — В ПАМЯТИ ПРОЦЕССА, БД сознательно не разворачиваем. Рестарт
 * контейнера обнуляет контекст: бот переспросит, это дешевле, чем инфраструктура
 * ради переписки, которая всё равно живёт минуты. Из этого следует и
 * ограничение: при нескольких инстансах приложения контекст у каждого свой.
 *
 * Роста памяти нет: чаты вытесняются по TTL и по общему потолку.
 */

import {
  AI_CONTEXT_MESSAGES,
  AI_CONTEXT_TTL_MS,
  AI_GLOBAL_QUOTA_LIMIT,
  AI_MAX_TRACKED_CHATS,
  AI_QUOTA_LIMIT,
  AI_QUOTA_WINDOW_MS,
} from '@/lib/ai-config';
import { createWindowLimiter } from '@/lib/rate-limit';

export type ChatTurn = { role: 'user' | 'assistant'; text: string };

type ChatState = {
  /** Последние сообщения диалога, старые в начале. */
  history: ChatTurn[];
  /** Отметки времени обращений к API — для скользящего окна квоты. */
  calls: number[];
  /** Сводка, ещё не отданная команде. */
  summary?: string;
  /** Последняя активность — по ней вытесняем. */
  seenAt: number;
};

const chats = new Map<string, ChatState>();

function state(chatId: string, now: number): ChatState {
  const existing = chats.get(chatId);
  if (existing) {
    existing.seenAt = now;
    return existing;
  }
  const fresh: ChatState = { history: [], calls: [], seenAt: now };
  chats.set(chatId, fresh);
  return fresh;
}

/** Чистит протухшие чаты и держит общий потолок. */
function evict(now: number): void {
  for (const [id, chat] of chats) {
    if (now - chat.seenAt > AI_CONTEXT_TTL_MS) chats.delete(id);
  }
  if (chats.size <= AI_MAX_TRACKED_CHATS) return;
  // Map хранит порядок вставки, но не активности — сортируем по seenAt.
  const oldestFirst = [...chats.entries()].sort((a, b) => a[1].seenAt - b[1].seenAt);
  for (const [id] of oldestFirst.slice(0, chats.size - AI_MAX_TRACKED_CHATS)) {
    chats.delete(id);
  }
}

/** Последние сообщения диалога. Всегда начинается с реплики клиента. */
export function getHistory(chatId: string, now = Date.now()): ChatTurn[] {
  evict(now);
  const history = chats.get(chatId)?.history ?? [];
  // Модель требует, чтобы диалог начинался с пользователя: если после обрезки
  // первой оказалась реплика ассистента, отбрасываем её.
  return history[0]?.role === 'assistant' ? history.slice(1) : history;
}

/**
 * Записывает состоявшийся обмен. Вызывающий (`lib/bot-reply.ts`) обязан
 * передавать сюда ФАКТИЧЕСКИ отправленный клиенту текст — успешный ответ ИИ
 * или шаблон деградации — а не то, что вернула (и, может, не вернула) модель.
 * Раньше при деградации обмен не писался вовсе: диалог терял память при любом
 * сбое (постфильтр, таймаут, сетевая ошибка) и на следующем сообщении не
 * помнил, что клиент уже писал.
 */
export function rememberExchange(
  chatId: string,
  userText: string,
  assistantText: string,
  now = Date.now(),
): void {
  const chat = state(chatId, now);
  chat.history.push({ role: 'user', text: userText }, { role: 'assistant', text: assistantText });
  if (chat.history.length > AI_CONTEXT_MESSAGES) {
    chat.history = chat.history.slice(-AI_CONTEXT_MESSAGES);
  }
  evict(now);
}

export type QuotaCheck = { allowed: boolean; used: number; limit: number };

/**
 * Расход квоты по скользящему часу. Считаем ПОПЫТКУ обращения к API, а не
 * успешный ответ: защищаемся от расхода на ретраях и от флуда одним чатом.
 */
export function consumeQuota(chatId: string, now = Date.now()): QuotaCheck {
  const chat = state(chatId, now);
  chat.calls = chat.calls.filter((ts) => now - ts < AI_QUOTA_WINDOW_MS);
  if (chat.calls.length >= AI_QUOTA_LIMIT) {
    return { allowed: false, used: chat.calls.length, limit: AI_QUOTA_LIMIT };
  }
  chat.calls.push(now);
  return { allowed: true, used: chat.calls.length, limit: AI_QUOTA_LIMIT };
}

/**
 * Общий потолок обращений к API на весь процесс.
 *
 * Считается ОТДЕЛЬНО от `chats`: вытеснение по TTL и по числу чатов не должно
 * возвращать израсходованный общий лимит. Именно поэтому он живёт не в
 * `ChatState` — иначе смена `chat.id` в теле апдейта заводила бы новую запись
 * с нулевым счётчиком, то есть ровно тот обход, который потолок и закрывает.
 */
const globalCalls = createWindowLimiter(AI_GLOBAL_QUOTA_LIMIT, AI_QUOTA_WINDOW_MS);

/**
 * Расход общего потолка. Проверяется ПОСЛЕ личной квоты чата: чат, уже
 * выбравший свою, не должен вдобавок тратить общий бюджет.
 */
export function consumeGlobalQuota(now = Date.now()): QuotaCheck {
  const used = globalCalls.used(now);
  if (!globalCalls.tryConsume(now)) {
    return { allowed: false, used, limit: AI_GLOBAL_QUOTA_LIMIT };
  }
  return { allowed: true, used: used + 1, limit: AI_GLOBAL_QUOTA_LIMIT };
}

/**
 * Последняя реплика ассистента в истории чата — то, что реально ушло
 * клиенту (успешный ответ ИИ или шаблон деградации, см. rememberExchange).
 * Используется, чтобы не повторять дословно один и тот же fallback на два
 * сбоя подряд (см. lib/bot-reply.ts).
 */
export function getLastAssistantReply(chatId: string): string | undefined {
  const chat = chats.get(chatId);
  if (!chat || chat.history.length === 0) return undefined;
  const last = chat.history[chat.history.length - 1];
  return last.role === 'assistant' ? last.text : undefined;
}

/** Сводка для команды: кладём при разборе ответа модели. */
export function putSummary(chatId: string, summary: string, now = Date.now()): void {
  state(chatId, now).summary = summary;
}

/** Забирает сводку и очищает — второй раз одно и то же в чат не уедет. */
export function takeSummary(chatId: string): string | undefined {
  const chat = chats.get(chatId);
  if (!chat?.summary) return undefined;
  const summary = chat.summary;
  chat.summary = undefined;
  return summary;
}

/** Только для тестов и диагностики. */
export function resetAiMemory(): void {
  chats.clear();
  globalCalls.reset();
}
