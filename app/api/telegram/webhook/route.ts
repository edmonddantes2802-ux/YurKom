import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramMessage, moscowTime } from '@/lib/telegram';
import { composeReply } from '@/lib/bot-reply';

export const runtime = 'nodejs';

/**
 * Бот-секретарь: приём сообщений из Telegram.
 *
 * Регистрация вебхука (один раз, вручную):
 *   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
 *     -d "url=https://mitragost.ru/api/telegram/webhook" \
 *     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
 *
 * Порядок работы жёсткий и не зависит от ИИ:
 *   1. сообщение клиента ВСЕГДА уходит в рабочую группу — ответил ИИ или нет;
 *   2. клиент ВСЕГДА получает ответ: ИИ либо шаблон;
 *   3. каким путём пошёл ответ — пишется в лог маркером BOT_REPLY.
 */

/** Телеграму отвечаем 200 почти всегда: на другой код он начнёт ретраить. */
const OK = NextResponse.json({ ok: true });

type TelegramUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramUpdate = {
  message?: {
    message_id?: number;
    chat?: { id?: number; type?: string };
    from?: TelegramUser;
    text?: string;
  };
};

/** Как подписать отправителя в пересылке. */
function describeSender(from: TelegramUser | undefined, chatId: string): string {
  const name = [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim();
  const parts = [name || 'без имени'];
  if (from?.username) parts.push(`@${from.username}`);
  parts.push(`chat ${chatId}`);
  return parts.join(', ');
}

export async function POST(req: NextRequest) {
  // Вебхук открыт наружу, поэтому сверяем секрет. Не задан — пропускаем
  // проверку, но это допустимо только на стенде (см. .env.example).
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    // Битое тело ретраить бессмысленно — отвечаем 200 и забываем.
    return OK;
  }

  const message = update.message;
  const chatId = message?.chat?.id !== undefined ? String(message.chat.id) : '';
  const text = typeof message?.text === 'string' ? message.text.trim() : '';

  // Не текст (стикер, фото, служебное событие) или нет чата — ответить нечем.
  if (!chatId || !text) return OK;

  // 1. Пересылка в рабочую группу — до всякого ИИ, чтобы сообщение клиента
  //    дошло до команды даже если дальше всё сломается.
  const forward = await sendTelegramMessage(
    [
      'Сообщение боту',
      '',
      `От: ${describeSender(message?.from, chatId)}`,
      '',
      text,
      '',
      `Время: ${moscowTime()} МСК`,
    ].join('\n'),
  );
  if (!forward.ok) {
    // Заявка не должна пропасть молча: тот же маркер, что и у формы.
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

  // 2. Ответ клиенту. composeReply не бросает: в худшем случае вернёт шаблон.
  const reply = await composeReply({ text, chatId });
  const sent = await sendTelegramMessage(reply.text, { chatId });

  // 3. Каким путём пошёл ответ.
  console.log(
    'BOT_REPLY',
    JSON.stringify({
      via: reply.via,
      reason: reply.reason,
      chatId,
      forwarded: forward.ok,
      delivered: sent.ok,
      deliveryError: sent.ok ? undefined : sent.reason,
    }),
  );

  return OK;
}
