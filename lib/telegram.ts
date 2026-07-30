/**
 * Отправка сообщений в Telegram. Серверный модуль: токен в браузер попадать
 * не должен, поэтому переменные без префикса NEXT_PUBLIC_.
 *
 * Токен и чат берутся ТОЛЬКО из окружения (`TELEGRAM_BOT_TOKEN`,
 * `TELEGRAM_CHAT_ID`). В коде и в git их нет и быть не может: утёкший токен —
 * это чужой доступ к переписке с клиентами.
 *
 * Модуль ничего не бросает наружу: вызывающий получает результат и сам решает,
 * писать ли в fallback. Заявка не должна теряться из-за недоступного мессенджера.
 */

import { withRetry } from '@/lib/retry';

export const TELEGRAM_TIMEOUT_MS = 5_000;

/**
 * Пересылка в рабочую группу (заявка с формы, сообщение боту) — это НЕ то же
 * самое, что ответ клиенту: потерянная пересылка — потерянный лид, а
 * потерянный ответ клиенту клиент хотя бы видит вживую и может написать
 * снова. Поэтому у критичной пересылки попыток больше и таймаут длиннее.
 */
export const TELEGRAM_CRITICAL_TIMEOUT_MS = 8_000;

/** Предел Telegram — 4096 символов на сообщение; режем с запасом. */
const MAX_MESSAGE_LEN = 3900;

export type TelegramResult = { ok: true } | { ok: false; reason: string };

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

/** Обрезает по длине сообщения Telegram, помечая обрыв. */
export function clampMessage(text: string): string {
  if (text.length <= MAX_MESSAGE_LEN) return text;
  return text.slice(0, MAX_MESSAGE_LEN) + '\n\n[…текст обрезан по длине сообщения]';
}

/** HTTP-ответ Telegram не 2xx — статус нужен, чтобы отличить 4xx (не ретраить) от 5xx (ретраить). */
class TelegramHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'TelegramHttpError';
  }
}

/** Не настроен токен/чат — повторять бессмысленно, это не транзиентная ошибка. */
class TelegramConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelegramConfigError';
  }
}

/**
 * Ретраить сетевые сбои (fetch бросает `TypeError`/`AbortError`/`TimeoutError`
 * без статуса) и 5xx. Не ретраить 4xx — неверный чат/токен/тело запроса не
 * починится повторной попыткой — и конфигурационные ошибки.
 */
function isRetryableTelegramError(err: unknown): boolean {
  if (err instanceof TelegramConfigError) return false;
  if (err instanceof TelegramHttpError) return err.status >= 500;
  return true;
}

function logRetry(label: string, attempt: number, attempts: number, err: unknown, delayMs: number): void {
  const reason = err instanceof Error ? `${err.name}: ${err.message}` : 'unknown error';
  console.error(
    'TELEGRAM_RETRY',
    JSON.stringify({ label, attempt, attempts, reason, nextDelayMs: delayMs }),
  );
}

async function attemptSend(text: string, chatId: string, timeoutMs: number): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramConfigError('TELEGRAM_BOT_TOKEN is not configured');
  if (!chatId) throw new TelegramConfigError('TELEGRAM_CHAT_ID is not configured');

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: clampMessage(text) }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    // Тело ответа Telegram содержит описание ошибки — оно нужно в логе,
    // иначе «не 200» не диагностируется. Токен в описании не встречается.
    const detail = await res.text().catch(() => '');
    throw new TelegramHttpError(res.status, `telegram responded ${res.status}: ${detail.slice(0, 300)}`);
  }
}

/**
 * Шлёт текст в чат. `chatId` не задан — берётся `TELEGRAM_CHAT_ID`
 * (рабочая группа); для ответа клиенту передаётся его чат.
 *
 * `parse_mode` намеренно не указан: текст уходит как plain, и произвольное
 * содержимое заявки не может сломать разметку или подставить ссылку.
 *
 * `critical: true` — для пересылки в рабочую группу (заявка/сообщение боту):
 * 4 попытки вместо 3, таймаут 8 секунд вместо 5 (см. `TELEGRAM_CRITICAL_TIMEOUT_MS`).
 */
export async function sendTelegramMessage(
  text: string,
  options: { chatId?: string; timeoutMs?: number; critical?: boolean } = {},
): Promise<TelegramResult> {
  const chatId = options.chatId || process.env.TELEGRAM_CHAT_ID || '';
  const timeoutMs =
    options.timeoutMs ?? (options.critical ? TELEGRAM_CRITICAL_TIMEOUT_MS : TELEGRAM_TIMEOUT_MS);
  const label = options.critical ? 'forward' : 'reply';

  try {
    await withRetry(
      () => attemptSend(text, chatId, timeoutMs),
      {
        attempts: options.critical ? 4 : 3,
        delaysMs: options.critical ? [300, 900, 2_700] : [300, 900],
        isRetryable: isRetryableTelegramError,
      },
      (attempt, attempts, err, delay) => logRetry(label, attempt, attempts, err, delay),
    );
    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : 'unknown error';
    return { ok: false, reason };
  }
}

/**
 * «Печатает…» в чате клиента.
 *
 * Статус живёт ~5 секунд или до первого сообщения, поэтому шлётся перед каждой
 * порцией ответа. Таймаут короткий и ошибки глотаются: индикатор — украшение,
 * из-за него нельзя задержать или сорвать сам ответ.
 */
export async function sendChatAction(
  chatId: string,
  action: 'typing' = 'typing',
  timeoutMs = 2_000,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // Молча: без индикатора ответ всё равно дойдёт.
  }
}

/** Telegram гасит «печатает…» через ~5 с — обновляем чаще, с запасом. */
const TYPING_REFRESH_MS = 4_000;

/**
 * Держит «печатает…» живым на время ожидания долгого ответа (до 25 с у
 * `AI_TIMEOUT_MS` в `lib/bot-reply.ts`) — без повторной отправки индикатор
 * погас бы через ~5 с, и клиент решил бы, что бот перестал печатать на
 * середине ожидания. Возвращает функцию остановки — вызвать сразу, как
 * только ответ (успешный или деградация) готов, чтобы не слать лишние
 * запросы после того, как ждать уже нечего.
 */
export function keepTyping(chatId: string, intervalMs = TYPING_REFRESH_MS): () => void {
  void sendChatAction(chatId, 'typing');
  const timer = setInterval(() => {
    void sendChatAction(chatId, 'typing');
  }, intervalMs);
  return () => clearInterval(timer);
}

export type LeadPayload = {
  situation: string;
  phone: string;
  /** Слаг посадочной или `homepage`. */
  source: string;
  utm: Record<string, string>;
  /**
   * Классификация ИИ: направление, срочность, суть. Необязательна — сбой
   * классификации (ключ не задан, таймаут, ошибка) не должен мешать
   * заявке уйти: карточка просто выглядит как раньше, без этого блока.
   */
  aiSummary?: { directionLabel: string; urgency: string; summary: string };
};

/**
 * Человекочитаемая карточка заявки для рабочего чата. Без разметки: сообщение
 * уходит plain-текстом, поэтому содержимое заявки ничего не может сломать.
 *
 * Сводка ИИ (если есть) идёт сверху, но исходный текст клиента — ВСЕГДА,
 * оригинал не теряется ни при удачной, ни при неудачной классификации.
 */
export function formatLead(lead: LeadPayload, ip: string, now = new Date()): string {
  const lines = ['Заявка с сайта'];

  if (lead.aiSummary) {
    lines.push(
      '',
      `Направление: ${lead.aiSummary.directionLabel}`,
      `Срочность: ${lead.aiSummary.urgency}`,
      `Суть: ${lead.aiSummary.summary}`,
    );
  }

  lines.push(
    '',
    'Ситуация:',
    lead.situation,
    '',
    `Телефон: ${lead.phone || 'не указан'}`,
    `Страница: ${lead.source}`,
  );

  const utmPairs = Object.entries(lead.utm);
  if (utmPairs.length > 0) {
    lines.push(`Метки: ${utmPairs.map(([key, value]) => `${key}=${value}`).join(', ')}`);
  }

  lines.push(`Время: ${moscowTime(now)} МСК`, `IP: ${ip}`);
  return lines.join('\n');
}

/** Время в московской зоне: команда читает заявки в ней, а контейнер живёт в UTC. */
export function moscowTime(date = new Date()): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
