/**
 * Доставка ответа клиенту «по-человечески»: индикатор набора, пауза перед
 * отправкой, длинный ответ — двумя-тремя короткими сообщениями, а не стеной.
 *
 * Зачем: мгновенная простыня текста читается как автоответчик, а человек в
 * кризисе к автоответчику доверия не испытывает.
 *
 * Бюджет времени жёсткий. Внешний таймаут ИИ — 8 секунд (`lib/bot-reply.ts`),
 * и паузы идут ПОСЛЕ него. Поэтому:
 *   - на все паузы вместе отведено не больше DELIVERY_BUDGET_MS;
 *   - время, уже потраченное на ответ модели, вычитается из первой паузы:
 *     клиент эти секунды и так видел индикатор набора.
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
  retried: boolean;
  reason?: string;
};

/**
 * Отправляет ответ клиенту. Не бросает исключений.
 *
 * `spentMs` — сколько уже ушло на подготовку ответа: на эту величину
 * укорачивается первая пауза.
 */
export async function deliverReply(
  text: string,
  chatId: string,
  options: { spentMs?: number; budgetMs?: number } = {},
): Promise<DeliveryResult> {
  const chunks = splitReply(text);
  let budget = Math.max(0, (options.budgetMs ?? DELIVERY_BUDGET_MS) - (options.spentMs ?? 0));

  let sent = 0;
  let retried = false;
  let reason: string | undefined;

  for (const chunk of chunks) {
    const pause = Math.min(budget, pauseFor(chunk.length));
    budget -= pause;

    // Индикатор до паузы: он должен гореть, пока клиент ждёт.
    await sendChatAction(chatId, 'typing');
    await sleep(pause);

    let result: TelegramResult = await sendTelegramMessage(chunk, { chatId });
    if (!result.ok) {
      // Одна повторная попытка: единственный шанс ответить у нас здесь, а самая
      // частая причина отказа — сетевой таймаут, а не отказ Telegram.
      retried = true;
      result = await sendTelegramMessage(chunk, { chatId });
    }

    if (!result.ok) {
      reason = result.reason;
      // Дальше молотить смысла нет: связи нет, а обрывок диалога хуже паузы.
      break;
    }
    sent += 1;
  }

  return { ok: sent === chunks.length, sent, chunks: chunks.length, retried, reason };
}
