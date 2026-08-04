import { PHONE } from '@/lib/contacts';
import { aiReply, type AiReply, type AiReplyInput } from '@/lib/ai';
import { getLastAssistantReply, rememberExchange } from '@/lib/ai-memory';
import { enqueueForChat } from '@/lib/chat-queue';

export type { AiReply };

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

/**
 * Тексты деградации — заглушки, финальные формулировки согласуются отдельно.
 *
 * Раньше был один константный FALLBACK_REPLY на любой сбой ИИ: клиент получал
 * дословно один и тот же текст сколько угодно раз подряд (см. разбор в
 * WORKLOG, инцидент 13:37–13:38 — «Заявка принята...» дважды подряд на два
 * разных сообщения), а сам текст обещал «юрист свяжется в ближайшее время»
 * круглосуточно, включая ночь, когда это неправда.
 *
 * Два независимых измерения:
 *   1. время суток по Москве — рабочее (обещаем скорость, даём телефон) или
 *      ночное (не обещаем, телефон не даём — звонить всё равно некому);
 *   2. первый сбой в чате или уже не первый подряд — текст должен отличаться
 *      от того, что реально ушло клиенту прошлым сообщением, а не повторять
 *      его дословно.
 */
export const FALLBACK_REPLY_DAY = [
  'Здравствуйте. Заявка принята — юрист свяжется в ближайшее время.',
  '',
  'Опишите ситуацию подробнее: что произошло, когда, какие документы на руках.',
  '',
  `Срочно — позвоните ${PHONE}`,
].join('\n');

export const FALLBACK_REPLY_DAY_REPEAT = [
  'Сообщение получено — оно уже у юриста, он свяжется, как только освободится.',
  '',
  `Если срочно — позвоните ${PHONE}`,
].join('\n');

export const FALLBACK_REPLY_NIGHT = [
  'Здравствуйте. Сообщение принято — юрист посмотрит его с началом рабочего дня.',
  '',
  'Опишите ситуацию подробнее: что произошло, когда, какие документы на руках — это ускорит разбор.',
].join('\n');

export const FALLBACK_REPLY_NIGHT_REPEAT = [
  'Сообщение получено. Сейчас нерабочее время — юрист посмотрит его одним из первых с началом дня.',
].join('\n');

const ALL_FALLBACK_REPLIES = new Set([
  FALLBACK_REPLY_DAY,
  FALLBACK_REPLY_DAY_REPEAT,
  FALLBACK_REPLY_NIGHT,
  FALLBACK_REPLY_NIGHT_REPEAT,
]);

/** Рабочее время по Москве: 9:00–21:00 обещаем скорую связь, за пределами — нет. */
const DAY_START_HOUR = 9;
const NIGHT_START_HOUR = 21;

function moscowHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }).format(now),
  );
}

function isDaytimeMoscow(now: Date): boolean {
  const hour = moscowHour(now);
  return hour >= DAY_START_HOUR && hour < NIGHT_START_HOUR;
}

/**
 * Выбирает текст деградации: время суток (МСК) плюс то, был ли последним
 * реальным ответом этому чату уже другой fallback — тогда берём вариант
 * «повтор», чтобы не прислать то же самое дословно второй раз подряд.
 */
export function pickFallbackReply(chatId: string, now = new Date()): string {
  const wasFallback = ALL_FALLBACK_REPLIES.has(getLastAssistantReply(chatId) ?? '');
  if (isDaytimeMoscow(now)) {
    return wasFallback ? FALLBACK_REPLY_DAY_REPEAT : FALLBACK_REPLY_DAY;
  }
  return wasFallback ? FALLBACK_REPLY_NIGHT_REPEAT : FALLBACK_REPLY_NIGHT;
}

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

/** Что composeReply умеет подменять в тестах — по умолчанию настоящий aiReply. */
export type ComposeReplyDeps = { aiReply: AiReply };
const defaultDeps: ComposeReplyDeps = { aiReply };

/**
 * Возвращает ответ клиенту. Не бросает исключений: худший случай — шаблон.
 *
 * Выполнение поставлено в очередь по `chatId` (см. lib/chat-queue.ts): два
 * быстрых сообщения одного клиента подряд иначе читают историю диалога
 * параллельно, оба видят её пустой, и второй ответ не учитывает первый обмен
 * — с очередью второй вызов стартует только после того, как первый допишет
 * свой обмен в историю через rememberExchange. Разные chatId друг друга не
 * ждут.
 */
export async function composeReply(input: AiReplyInput, deps: ComposeReplyDeps = defaultDeps): Promise<BotReply> {
  return enqueueForChat(input.chatId, () => composeReplyTask(input, deps));
}

/** Деградация: выбирает текст ДО записи в историю — иначе pickFallbackReply увидит уже этот же ответ как «предыдущий». */
function degrade(input: AiReplyInput, reason: string): BotReply {
  const text = pickFallbackReply(input.chatId);
  rememberExchange(input.chatId, input.text, text);
  return { text, via: 'fallback', reason };
}

async function composeReplyTask(input: AiReplyInput, deps: ComposeReplyDeps): Promise<BotReply> {
  if (!deps.aiReply) {
    return degrade(input, 'ai is not configured');
  }

  try {
    const text = (await withTimeout(deps.aiReply(input), AI_TIMEOUT_MS)).trim();
    if (!text) {
      return degrade(input, 'ai returned empty text');
    }
    rememberExchange(input.chatId, input.text, text);
    return { text, via: 'ai' };
  } catch (err) {
    // Сюда попадают и таймаут, и сетевые ошибки, и rate limit от провайдера.
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : 'unknown ai error';
    return degrade(input, reason);
  }
}
