import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramMessage, moscowTime } from '@/lib/telegram';
import { composeReply } from '@/lib/bot-reply';
import { aiReply } from '@/lib/ai';

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

/** Как подписать отправителя в пересылке. */
function describeSender(from: TelegramUser | undefined, chatId: string): string {
  const name = [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim();
  const parts = [name || 'без имени'];
  if (from?.username) parts.push(`@${from.username}`);
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

/**
 * Проверка живости роута снаружи, без секретов в ответе.
 *
 * Отвечает на вопрос «доехала ли сборка и что в ней настроено» одной
 * командой с любой машины:
 *   curl -s https://mitragost.ru/api/telegram/webhook
 *
 * Значения переменных не раскрываются — только факт, что они заданы.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: 'telegram-webhook',
    /** Меняется при каждой правке этого файла — видно, что версия свежая. */
    revision: 'diagnostics-1',
    configured: {
      botToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      chatId: Boolean(process.env.TELEGRAM_CHAT_ID),
      webhookSecret: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
      ai: Boolean(aiReply),
    },
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
  const text = typeof raw === 'string' ? raw.trim() : '';

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
  const [forward, reply] = await Promise.all([
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
    ),
    isStart
      ? Promise.resolve({ text: START_REPLY, via: 'fallback' as const, reason: 'start command' })
      : composeReply({ text, chatId }),
  ]);

  if (!forward.ok) {
    // Обращение не должно пропасть молча: тот же маркер, что и у формы.
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

  // Ответ клиенту — в ЕГО чат (chat.id из апдейта), не в рабочую группу.
  let sent = await sendTelegramMessage(reply.text, { chatId });
  let retried = false;
  if (!sent.ok) {
    // Одна повторная попытка: единственный шанс ответить у нас здесь, а самая
    // частая причина отказа — сетевой таймаут, а не отказ Telegram.
    retried = true;
    sent = await sendTelegramMessage(reply.text, { chatId });
  }

  logExit({
    via: reply.via,
    reason: reply.reason,
    chatId,
    isStart,
    forwarded: forward.ok,
    forwardError: forward.ok ? undefined : forward.reason,
    delivered: sent.ok,
    retried,
    deliveryError: sent.ok ? undefined : sent.reason,
  });

  return ok();
}
