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
  AI_MAX_TRACKED_CHATS,
  AI_QUOTA_LIMIT,
  AI_QUOTA_WINDOW_MS,
} from '@/lib/ai-config';

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
 * Записывает состоявшийся обмен. Пишем ТОЛЬКО ответы, которые реально ушли
 * клиенту: отфильтрованный или пустой ответ в контексте — это ложная память,
 * модель будет ссылаться на то, чего человек не читал.
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
}
