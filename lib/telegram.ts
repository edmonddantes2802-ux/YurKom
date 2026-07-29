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

export const TELEGRAM_TIMEOUT_MS = 5_000;

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

/**
 * Шлёт текст в чат. `chatId` не задан — берётся `TELEGRAM_CHAT_ID`
 * (рабочая группа); для ответа клиенту передаётся его чат.
 *
 * `parse_mode` намеренно не указан: текст уходит как plain, и произвольное
 * содержимое заявки не может сломать разметку или подставить ссылку.
 */
export async function sendTelegramMessage(
  text: string,
  options: { chatId?: string; timeoutMs?: number } = {},
): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = options.chatId || process.env.TELEGRAM_CHAT_ID;

  if (!token) return { ok: false, reason: 'TELEGRAM_BOT_TOKEN is not configured' };
  if (!chatId) return { ok: false, reason: 'TELEGRAM_CHAT_ID is not configured' };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: clampMessage(text) }),
      signal: AbortSignal.timeout(options.timeoutMs ?? TELEGRAM_TIMEOUT_MS),
    });

    if (!res.ok) {
      // Тело ответа Telegram содержит описание ошибки — оно нужно в логе,
      // иначе «не 200» не диагностируется. Токен в описании не встречается.
      const detail = await res.text().catch(() => '');
      return { ok: false, reason: `telegram responded ${res.status}: ${detail.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    // Сюда же попадает таймаут: AbortSignal.timeout бросает TimeoutError.
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
