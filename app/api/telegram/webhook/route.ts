import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramMessage, keepTyping, moscowTime } from '@/lib/telegram';
import { composeReply } from '@/lib/bot-reply';
import { deliverReply } from '@/lib/deliver';
import { sanitizeText } from '@/lib/validation';
import { SITUATION_MAX } from '@/lib/limits';
import { isAiConfigured } from '@/lib/ai';
import { takeSummary } from '@/lib/ai-memory';

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
 * Проверка живости роута снаружи, без секретов в ответе.
 *
 * Отвечает на вопрос «доехала ли сборка и что в ней настроено» одной
 * командой с любой машины:
 *   curl -s https://mitragost.ru/api/telegram/webhook
 *
 * Значения переменных не раскрываются — только факт, что они заданы.
 *
 * `network` — отдельный вопрос «жива ли сеть с VPS прямо сейчас»: конкретно
 * этот разбор («AI_REPLY via: error, Connection error» + «fetch failed» на
 * пересылке в Telegram) показал, что сеть с VPS до внешних API нестабильна,
 * а увидеть это одним запросом было нечем — раньше приходилось гадать по
 * логам постфактум.
 */
export async function GET() {
  const [anthropic, telegram] = await Promise.all([
    pingHost('https://api.anthropic.com/'),
    pingHost('https://api.telegram.org/'),
  ]);

  return NextResponse.json({
    ok: true,
    route: 'telegram-webhook',
    /** Меняется при каждой правке этого файла — видно, что версия свежая. */
    revision: 'ai-2',
    configured: {
      botToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      chatId: Boolean(process.env.TELEGRAM_CHAT_ID),
      webhookSecret: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
      ai: isAiConfigured(),
    },
    network: { anthropic, telegram },
    now: new Date().toISOString(),
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

  // Вебхук открыт наружу, поэтому сверяем секрет. Не задан — пропускаем
  // проверку, но это допустимо только на стенде (см. .env.example).
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    logExit({ via: 'rejected', reason: 'secret mismatch' });
    return NextResponse.json({ ok: false }, { status: 401 });
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
