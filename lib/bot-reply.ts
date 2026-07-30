import { PHONE } from '@/lib/contacts';
import { aiReply, type AiReplyInput } from '@/lib/ai';
import { rememberExchange } from '@/lib/ai-memory';

/**
 * Ответ бота-секретаря с деградацией.
 *
 * Правило: клиент НИКОГДА не остаётся без ответа. ИИ — необязательное звено,
 * и любой его отказ (не подключён, ошибка, rate limit, не уложился в
 * `AI_TIMEOUT_MS`, вернул пустоту) молча переводит бота на шаблон. Человеку в
 * кризисе всё равно, почему молчит бот, — ему нужен ответ.
 *
 * История диалога (`rememberExchange`) пишется ЗДЕСЬ, а не в `lib/ai.ts`, и на
 * ВСЕХ путях, включая шаблон: до этой правки при любой деградации (постфильтр,
 * таймаут, сетевая ошибка) обмен вообще не попадал в память чата — на
 * следующем сообщении модель не видела, что клиент уже писал, и с высокой
 * вероятностью повторяла тот же путь к деградации ещё раз. Ложной памяти
 * здесь нет: что записываем в историю — то и было реально отправлено клиенту.
 */

/**
 * Сколько ждём ИИ. Поднято с 8 до 25 с: прод показал канал до Anthropic
 * стабильно медленным (успешные вызовы 2571–5949 мс против нормальных 1–2 с
 * у короткого ответа Sonnet) — на 8 с бюджет ретраев (`AI_TOTAL_BUDGET_MS` в
 * `lib/ai-config.ts`) не оставлял места на вторую попытку: реальный сбой упёрся
 * ровно в 7502 мс. Вебхук Telegram ждёт ответа ~60 с — 25 с укладывается с
 * большим запасом (см. `keepTyping` в `lib/telegram.ts`: индикатор набора
 * поддерживается всё это время, а не гаснет через 5 с).
 */
export const AI_TIMEOUT_MS = 25_000;

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
    rememberExchange(input.chatId, input.text, FALLBACK_REPLY);
    return { text: FALLBACK_REPLY, via: 'fallback', reason: 'ai is not configured' };
  }

  try {
    const text = (await withTimeout(aiReply(input), AI_TIMEOUT_MS)).trim();
    if (!text) {
      rememberExchange(input.chatId, input.text, FALLBACK_REPLY);
      return { text: FALLBACK_REPLY, via: 'fallback', reason: 'ai returned empty text' };
    }
    rememberExchange(input.chatId, input.text, text);
    return { text, via: 'ai' };
  } catch (err) {
    // Сюда попадают и таймаут, и сетевые ошибки, и rate limit от провайдера.
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : 'unknown ai error';
    rememberExchange(input.chatId, input.text, FALLBACK_REPLY);
    return { text: FALLBACK_REPLY, via: 'fallback', reason };
  }
}
