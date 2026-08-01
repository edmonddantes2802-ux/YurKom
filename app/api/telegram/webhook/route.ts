import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramMessage, keepTyping, moscowTime } from '@/lib/telegram';
import { composeReply } from '@/lib/bot-reply';
import { deliverReply } from '@/lib/deliver';
import { sanitizeText } from '@/lib/validation';
import { SITUATION_MAX } from '@/lib/limits';
import { isAiConfigured } from '@/lib/ai';
import { takeSummary } from '@/lib/ai-memory';
import {
  isWebhookSecretConfigured,
  verifyWebhookSecret,
  warnIfWebhookSecretMissing,
} from '@/lib/webhook-auth';
import { allowWebhookRequest } from '@/lib/webhook-rate-limit';

export const runtime = 'nodejs';

/**
 * Бот-секретарь: приём сообщений из Telegram.
 *
 * Регистрация вебхука (один раз, вручную). `allowed_updates` указываем явно:
 * без него Telegram шлёт набор по умолчанию, а с ранее заданным списком,
 * куда не входит `message`, апдейты не приходят вовсе — снаружи это выглядит
 * как исправный вебхук с нулевой очередью.
 *   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
 *     -d "url=https://mitragost.ru/api/telegram/webhook" \
 *     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
 *     -d 'allowed_updates=["message","edited_message"]'
 *
 * Порядок работы жёсткий и не зависит от ИИ:
 *   1. сообщение клиента ВСЕГДА уходит в рабочую группу — ответил ИИ или нет;
 *   2. клиент ВСЕГДА получает ответ: ИИ либо шаблон;
 *   3. КАЖДАЯ ветка выхода пишет лог BOT_REPLY — включая ранние возвраты,
 *      иначе «бот молчит» невозможно отличить от «апдейт не дошёл».
 */

/**
 * Телеграму отвечаем 200 почти всегда: на другой код он начнёт ретраить.
 *
 * ВАЖНО: именно функция, а не общая константа. `NextResponse` — это Response
 * с телом-потоком, который читается один раз; переиспользование одного объекта
 * отдавало со второго запроса пустое тело при коде 200. Telegram считал такой
 * ответ успешным, поэтому в `getWebhookInfo` не было ни ошибок, ни очереди.
 */
function ok(): NextResponse {
  return NextResponse.json({ ok: true });
}

/**
 * Единый лог выхода. Без него молчащий бот неотличим от недошедшего апдейта.
 *
 * Пишем в stderr, а не в stdout: в логах контейнера Coolify строки от
 * `console.error` (маркер LEAD_FALLBACK) видно, а `console.log` из роутов —
 * нет. Диагностика, которую не видно, бесполезна.
 */
function logExit(fields: Record<string, unknown>): void {
  console.error('BOT_REPLY', JSON.stringify(fields));
}

// Загрузка модуля роута = старт приложения. Если секрет не задан, вебхук
// теперь отвечает 401 всем подряд — без этой строки в логе будет только поток
// отказов, а причина останется неочевидной.
warnIfWebhookSecretMissing();

type TelegramUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramMessage = {
  message_id?: number;
  chat?: { id?: number; type?: string };
  from?: TelegramUser;
  /** Текст обычного сообщения. */
  text?: string;
  /** Подпись к фото/файлу — для человека это то же самое сообщение. */
  caption?: string;
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
};

/**
 * Как подписать отправителя в пересылке.
 *
 * Имя и username задаёт сам пользователь Telegram, поэтому они чистятся
 * наравне с текстом: в имя помещается и перевод строки, и невидимые символы,
 * которыми подпись можно подделать под соседнюю строку сообщения.
 */
function describeSender(from: TelegramUser | undefined, chatId: string): string {
  const clean = (value: string | undefined) =>
    typeof value === 'string' ? sanitizeText(value, 64).replace(/\n/g, ' ') : '';
  const name = [clean(from?.first_name), clean(from?.last_name)].filter(Boolean).join(' ').trim();
  const username = clean(from?.username);
  const parts = [name || 'без имени'];
  if (username) parts.push(`@${username}`);
  parts.push(`chat ${chatId}`);
  return parts.join(', ');
}

/**
 * Типы чатов, где `from.id` и `chat.id` заведомо разные: `chat.id` там —
 * идентификатор группы или канала, а `from.id` — конкретного участника.
 */
const GROUP_CHAT_TYPES = new Set(['group', 'supergroup', 'channel']);

/**
 * Совпадает ли отправитель с чатом, за который себя выдаёт.
 *
 * В приватном чате `from.id` у настоящего сообщения ВСЕГДА равен `chat.id`:
 * диалог один на один, и писать в него может только собеседник бота. Ответ же
 * уходит по `chat.id` из тела апдейта, поэтому без этой проверки тот, у кого
 * есть секрет вебхука, отправляет произвольный текст любому человеку от имени
 * официального бота службы — а `chat.id` в Telegram перебираемый.
 *
 * Секрет вебхука эту дыру закрывает лишь до первой утечки: он один на весь
 * трафик бота и не ротируется. Здесь — второй, независимый рубеж.
 *
 * Тип чата не назван — считаем чат приватным и проверяем. Иначе правило
 * обходилось бы простым отбрасыванием поля `type` из тела запроса. Настоящий
 * Telegram `chat.type` присылает всегда, так что живой трафик это не задевает.
 */
function senderOwnsChat(message: TelegramMessage | undefined): boolean {
  const type = message?.chat?.type;
  if (typeof type === 'string' && GROUP_CHAT_TYPES.has(type)) return true;

  const fromId = message?.from?.id;
  // Отправителя нет — проверить принадлежность нечем, значит не пропускаем.
  if (typeof fromId !== 'number') return false;

  return fromId === message?.chat?.id;
}

/**
 * Первое сообщение новому боту всегда `/start` — на него отвечаем как на
 * обычное обращение, но без слов «заявка принята»: человек ещё ничего не
 * рассказал. Остальные команды идут обычным путём.
 */
const START_REPLY = [
  'Здравствуйте. Это бот юридической антикризисной службы «Митрагост».',
  '',
  'Опишите ситуацию: что произошло, когда, какие документы на руках.',
  'Юрист прочитает и свяжется с вами.',
].join('\n');

type PingResult = { ok: boolean; ms: number; status?: number; reason?: string };

/**
 * «Пинг» внешнего хоста: живой ли путь с VPS наружу и сколько это занимает.
 * Любой HTTP-ответ (даже 404 — у обоих хостов нет открытого корня без
 * авторизации) значит, что DNS/TCP/TLS прошли — именно это и требуется
 * проверить, а не конкретный статус. `ok: false` — сеть не отвечает вовсе
 * (сорвалось до HTTP-уровня: DNS, TCP, TLS, таймаут).
 */
async function pingHost(url: string, timeoutMs = 3_000): Promise<PingResult> {
  const startedAt = Date.now();
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(timeoutMs) });
    return { ok: true, ms: Date.now() - startedAt, status: res.status };
  } catch (err) {
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : 'unknown error';
    return { ok: false, ms: Date.now() - startedAt, reason };
  }
}

/**
 * Проверка живости роута.
 *
 * Публично — только факт, что сборка доехала и роут отвечает:
 *   curl -s https://mitragost.ru/api/telegram/webhook
 *
 * Состав настроенных переменных и пинги наружу спрятаны за тем же секретом,
 * что и POST. Раньше они отдавались всем, и это было двумя разными проблемами
 * сразу. Во-первых, `configured.webhookSecret: false` — прямая наводка, что
 * защита бота сейчас не настроена, доступная кому угодно одной командой.
 * Во-вторых, `pingHost` на каждый запрос — это два исходящих соединения с
 * таймаутом 3 секунды, то есть дешёвый публичный запрос удерживал серверные
 * ресурсы кратно дольше собственной стоимости.
 *
 * Сама диагностика при этом сохранена: `network` отвечает на вопрос «жива ли
 * сеть с VPS прямо сейчас», и без неё разбор вида «AI_REPLY via: error,
 * Connection error» + «fetch failed» на пересылке снова придётся вести
 * гаданием по логам постфактум. Команде она доступна с тем же заголовком:
 *   curl -s -H "X-Telegram-Bot-Api-Secret-Token: <секрет>" https://mitragost.ru/api/telegram/webhook
 */
export async function GET(req: NextRequest) {
  const base = {
    ok: true,
    route: 'telegram-webhook',
    /** Меняется при каждой правке этого файла — видно, что версия свежая. */
    revision: 'ai-3',
    now: new Date().toISOString(),
  };

  if (!verifyWebhookSecret(req.headers.get('x-telegram-bot-api-secret-token'))) {
    return NextResponse.json(base);
  }

  const [anthropic, telegram] = await Promise.all([
    pingHost('https://api.anthropic.com/'),
    pingHost('https://api.telegram.org/'),
  ]);

  return NextResponse.json({
    ...base,
    configured: {
      botToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      chatId: Boolean(process.env.TELEGRAM_CHAT_ID),
      webhookSecret: isWebhookSecretConfigured(),
      ai: isAiConfigured(),
    },
    network: { anthropic, telegram },
  });
}

export async function POST(req: NextRequest) {
  // Факт вызова фиксируем ДО любых проверок: иначе «Telegram не доставил»
  // и «доставил, но роут отверг» выглядят снаружи одинаково.
  logExit({
    via: 'hit',
    hasSecretHeader: Boolean(req.headers.get('x-telegram-bot-api-secret-token')),
    contentLength: req.headers.get('content-length') ?? undefined,
  });

  // Вебхук открыт наружу, поэтому сверяем секрет. Проверка fail-closed: секрет
  // не задан — отвечаем 401 всем, включая настоящий Telegram. Прежний вариант
  // при незаданной переменной пропускал вообще всё (см. lib/webhook-auth.ts).
  if (!verifyWebhookSecret(req.headers.get('x-telegram-bot-api-secret-token'))) {
    logExit({ via: 'rejected', reason: 'secret mismatch or not configured' });
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Потолок на весь роут, а не на клиента: единственный идентификатор в
  // апдейте — chat.id из тела, и ограничивать по нему бессмысленно (см.
  // lib/webhook-rate-limit.ts). Проверяется ПОСЛЕ секрета, чтобы поток
  // неаутентифицированных запросов не съедал лимит настоящего Telegram.
  //
  // 429, а не 200: Telegram доставит такой апдейт повторно. Настоящее
  // обращение при всплеске задержится, но не пропадёт — а это единственный
  // исход, который здесь недопустим.
  if (!allowWebhookRequest()) {
    logExit({ via: 'rejected', reason: 'rate limited' });
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    // Битое тело ретраить бессмысленно — отвечаем 200 и забываем.
    logExit({ via: 'skipped', reason: 'body is not json' });
    return ok();
  }

  // Берём и отредактированные сообщения: для человека это то же обращение.
  const message = update.message ?? update.edited_message ?? update.channel_post;
  const chatId = message?.chat?.id !== undefined ? String(message.chat.id) : '';
  const raw = typeof message?.text === 'string' ? message.text : message?.caption;
  // Текст пересылается в рабочий чат, поэтому чистим так же, как заявку с
  // формы: управляющие символы, невидимки, лимит длины.
  const text = typeof raw === 'string' ? sanitizeText(raw, SITUATION_MAX) : '';

  if (!chatId || !text) {
    // Стикер, фото без подписи, служебное событие. Пишем, ЧТО именно пришло —
    // иначе непонятно, дошёл ли апдейт вообще.
    logExit({
      via: 'skipped',
      reason: !chatId ? 'no chat id' : 'no text or caption',
      updateId: update.update_id,
      updateKeys: Object.keys(update).filter((k) => k !== 'update_id'),
      chatType: message?.chat?.type,
    });
    return ok();
  }

  // Единственная проверка принадлежности в этом роуте: тот ли это чат, за
  // который себя выдаёт отправитель. Всё, что ниже, действует от имени
  // `chatId` — отвечает клиенту, читает и дополняет память диалога, тратит
  // квоту, — а сам `chatId` приходит в теле запроса.
  if (!senderOwnsChat(message)) {
    logExit({
      via: 'rejected',
      reason: 'sender does not match private chat',
      chatId,
      fromId: message?.from?.id,
      chatType: message?.chat?.type,
    });
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const isStart = text === '/start' || text.startsWith('/start ');

  // Пересылка в группу и подготовка ответа идут параллельно: последовательно
  // их таймауты складывались, и при медленной сети до api.telegram.org ответ
  // клиенту успевал упереться в собственный лимит.
  //
  // Индикатор «печатает…» — ОТДЕЛЬНО и не в этом Promise.all: Telegram гасит
  // его через ~5 с, а модель может думать до AI_TIMEOUT_MS (25 с) — без
  // повторной отправки клиент увидел бы, что бот «перестал печатать» на
  // середине ожидания. keepTyping сам шлёт его каждые 4 с, пока не остановлен.
  const startedAt = Date.now();
  const stopTyping = keepTyping(chatId);
  const [forward, reply] = await Promise.all([
    // critical: потерянная пересылка — потерянное обращение, попыток больше
    // и таймаут длиннее, чем у ответа клиенту (см. lib/telegram.ts).
    sendTelegramMessage(
      [
        'Сообщение боту',
        '',
        `От: ${describeSender(message?.from, chatId)}`,
        '',
        text,
        '',
        `Время: ${moscowTime()} МСК`,
      ].join('\n'),
      { critical: true },
    ),
    isStart
      ? Promise.resolve({ text: START_REPLY, via: 'fallback' as const, reason: 'start command' })
      : composeReply({ text, chatId }),
  ]);
  stopTyping();

  if (!forward.ok) {
    // Обращение не должно пропасть молча: тот же маркер, что и у формы.
    // Отдельная заметная строка сверху — LEAD_FALLBACK легко потерять при
    // разборе инцидента среди прочих логов.
    console.error(`LEAD_FORWARD_FAILED !!! сообщение боту не доехало до рабочей группы: ${forward.reason}`);
    console.error(
      'LEAD_FALLBACK',
      JSON.stringify({
        situation: text,
        phone: '',
        source: 'telegram_bot',
        utm: {},
        chatId,
        reason: forward.reason,
        createdAt: new Date().toISOString(),
      }),
    );
  }

  // Сводку по диалогу модель отдаёт отдельной служебной строкой; клиент её не
  // видит, она уходит команде в рабочую группу вместе с доставкой ответа.
  const summary = takeSummary(chatId);

  // Ответ клиенту — в ЕГО чат (chat.id из апдейта), не в рабочую группу.
  // Паузы внутри укорачиваются на уже потраченное время: эти секунды клиент
  // и так провёл, глядя на «печатает…».
  const [sent] = await Promise.all([
    deliverReply(reply.text, chatId, { spentMs: Date.now() - startedAt }),
    summary
      ? sendTelegramMessage(['Сводка по диалогу', '', `Чат: ${chatId}`, '', summary].join('\n'))
      : Promise.resolve(undefined),
  ]);

  logExit({
    via: reply.via,
    reason: reply.reason,
    chatId,
    isStart,
    forwarded: forward.ok,
    forwardError: forward.ok ? undefined : forward.reason,
    delivered: sent.ok,
    chunks: sent.chunks,
    deliveryError: sent.ok ? undefined : sent.reason,
    summarySent: Boolean(summary),
  });

  return ok();
}
