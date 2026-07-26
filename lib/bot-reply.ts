import { PHONE } from '@/lib/contacts';
import { aiReply, type AiReplyInput } from '@/lib/ai';

/**
 * Ответ бота-секретаря с деградацией.
 *
 * Правило: клиент НИКОГДА не остаётся без ответа. ИИ — необязательное звено,
 * и любой его отказ (не подключён, ошибка, rate limit, не уложился в 8 секунд,
 * вернул пустоту) молча переводит бота на шаблон. Человеку в кризисе всё
 * равно, почему молчит бот, — ему нужен ответ.
 */

/** Сколько ждём ИИ. Дольше — человек решает, что его игнорируют. */
export const AI_TIMEOUT_MS = 8_000;

export const FALLBACK_REPLY = [
  'Здравствуйте. Заявка принята — юрист свяжется в ближайшее время.',
  '',
  'Опишите ситуацию подробнее: что произошло, когда, какие документы на руках.',
  '',
  `Срочно — позвоните ${PHONE}`,
].join('\n');

export type ReplyRoute = 'ai' | 'fallback';

export type BotReply = {
  text: string;
  /** Каким путём пошёл ответ — пишется в лог. */
  via: ReplyRoute;
  /** Почему сработала деградация. Пусто, когда ответил ИИ. */
  reason?: string;
};

/** Отдельная функция, чтобы таймаут не зависел от реализации ИИ. */
function withTimeout(promise: Promise<string>, ms: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ai timeout after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Возвращает ответ клиенту. Не бросает исключений: худший случай — шаблон.
 */
export async function composeReply(input: AiReplyInput): Promise<BotReply> {
  if (!aiReply) {
    return { text: FALLBACK_REPLY, via: 'fallback', reason: 'ai is not configured' };
  }

  try {
    const text = (await withTimeout(aiReply(input), AI_TIMEOUT_MS)).trim();
    if (!text) {
      return { text: FALLBACK_REPLY, via: 'fallback', reason: 'ai returned empty text' };
    }
    return { text, via: 'ai' };
  } catch (err) {
    // Сюда попадают и таймаут, и сетевые ошибки, и rate limit от провайдера.
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : 'unknown ai error';
    return { text: FALLBACK_REPLY, via: 'fallback', reason };
  }
}
