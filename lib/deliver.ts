/**
 * Доставка ответа клиенту «по-человечески»: индикатор набора, пауза перед
 * отправкой, длинный ответ — двумя-тремя короткими сообщениями, а не стеной.
 *
 * Зачем: мгновенная простыня текста читается как автоответчик, а человек в
 * кризисе к автоответчику доверия не испытывает. Но это уместно, только когда
 * модель ответила быстро — изображать «печатает…» человеку, который уже
 * прождал модель 10–20 секунд, только раздражает.
 *
 * Бюджет времени жёсткий. Внешний таймаут ИИ — `AI_TIMEOUT_MS` в
 * `lib/bot-reply.ts` (25 с) — и паузы идут ПОСЛЕ него. Поэтому:
 *   - на все паузы вместе отведено не больше DELIVERY_BUDGET_MS (7 с);
 *   - время, уже потраченное на ответ модели (`spentMs`), вычитается из
 *     ОБЩЕГО бюджета паузы, а не только из первой: прод показал канал до
 *     Anthropic стабильно медленным (успешные вызовы 2571–5949 мс, не 1–2 с),
 *     то есть `spentMs` теперь обычно БЛИЗОК к `DELIVERY_BUDGET_MS` или
 *     превышает его уже на нормальном, не деградировавшем ответе — бюджет
 *     паузы в этом случае корректно уходит в 0 (`Math.max(0, ...)`), и все
 *     чанки уходят подряд без пауз. Это и есть нужное поведение: «человек уже
 *     ждёт — паузу сокращать или пропускать», просто оно уже было в формуле.
 */

import { sendChatAction, sendTelegramMessage, type TelegramResult } from '@/lib/telegram';

/** Потолок на все паузы вместе. Больше — Telegram начнёт ретраить вебхук. */
export const DELIVERY_BUDGET_MS = 7_000;

export const MIN_PAUSE_MS = 1_500;
export const MAX_PAUSE_MS = 4_000;

/** Короче — дробить нечего, отправляем одним сообщением. */
export const SPLIT_THRESHOLD = 320;

export const MAX_CHUNKS = 3;

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/** Пауза «на набор»: 1,5–4 секунды в зависимости от длины куска. */
export function pauseFor(length: number): number {
  return Math.min(MAX_PAUSE_MS, Math.max(MIN_PAUSE_MS, MIN_PAUSE_MS + length * 8));
}

/**
 * Режет ответ на 1–3 сообщения по границам абзацев (а если абзацев нет — по
 * границам предложений). Куски собираются жадно, чтобы не получилось
 * «две строки и хвост в один символ».
 */
export function splitReply(text: string, threshold = SPLIT_THRESHOLD): string[] {
  const clean = text.trim();
  if (clean.length <= threshold) return [clean];

  let parts = clean
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 1) {
    // Абзацев нет — рвём по концам предложений, знак препинания оставляем.
    parts = clean
      .split(/(?<=[.!?…])\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  if (parts.length === 1) return [clean];

  const wanted = Math.min(MAX_CHUNKS, Math.ceil(clean.length / threshold));
  const target = Math.ceil(clean.length / wanted);

  const chunks: string[] = [];
  let current = '';
  for (const part of parts) {
    const candidate = current ? `${current}\n\n${part}` : part;
    // Последний кусок добирает остаток: иначе хвост уедет в четвёртое сообщение.
    if (current && candidate.length > target && chunks.length < wanted - 1) {
      chunks.push(current);
      current = part;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);

  return chunks;
}

export type DeliveryResult = {
  ok: boolean;
  /** Сколько сообщений реально ушло. */
  sent: number;
  chunks: number;
  reason?: string;
};

/**
 * Отправляет ответ клиенту. Не бросает исключений.
 *
 * `spentMs` — сколько уже ушло на подготовку ответа: на эту величину
 * укорачивается ОБЩИЙ бюджет пауз (см. комментарий вверху файла), а не
 * только первая — если модель думала дольше бюджета, пауз не будет вовсе.
 */
export async function deliverReply(
  text: string,
  chatId: string,
  options: { spentMs?: number; budgetMs?: number } = {},
): Promise<DeliveryResult> {
  const chunks = splitReply(text);
  let budget = Math.max(0, (options.budgetMs ?? DELIVERY_BUDGET_MS) - (options.spentMs ?? 0));

  let sent = 0;
  let reason: string | undefined;

  for (const chunk of chunks) {
    const pause = Math.min(budget, pauseFor(chunk.length));
    budget -= pause;

    // Индикатор до паузы: он должен гореть, пока клиент ждёт.
    await sendChatAction(chatId, 'typing');
    await sleep(pause);

    // sendTelegramMessage ретраит сама (3 попытки, 300/900 мс — см.
    // lib/telegram.ts), отдельный ручной повтор здесь больше не нужен.
    const result: TelegramResult = await sendTelegramMessage(chunk, { chatId });

    if (!result.ok) {
      reason = result.reason;
      // Дальше молотить смысла нет: связи нет, а обрывок диалога хуже паузы.
      break;
    }
    sent += 1;
  }

  return { ok: sent === chunks.length, sent, chunks: chunks.length, reason };
}
