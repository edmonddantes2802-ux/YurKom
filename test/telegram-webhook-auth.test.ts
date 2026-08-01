/**
 * F1: секрет вебхука должен работать fail-closed.
 *
 * Вебхук — единственная граница доверия у бота: за ней и отправка сообщений
 * произвольному чату, и запись в память диалога, и платные вызовы модели.
 * Пока проверка выглядела как `if (secret && header !== secret)`, незаданная
 * переменная окружения превращала эту границу в её отсутствие, причём молча.
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/telegram/webhook/route';

/** Заглушка, а не настоящее значение: в окружении оно приходит из Coolify. */
const SECRET = 'example-webhook-secret-value';

const HEADER = 'x-telegram-bot-api-secret-token';

/** Минимальный валидный апдейт: чат и текст есть, значит роут дойдёт до дела. */
const UPDATE = {
  update_id: 1,
  message: {
    message_id: 10,
    chat: { id: 111, type: 'private' },
    from: { id: 111, first_name: 'Тест' },
    text: 'арестовали счёт, что делать',
  },
};

function makeRequest(headers: Record<string, string> = {}, body: unknown = UPDATE): NextRequest {
  return new NextRequest('https://example.test/api/telegram/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

/**
 * Роут пишет диагностику в stderr на каждой ветке выхода — в отчёте теста это
 * шум. Глушим только на время теста, `t.mock` возвращает всё обратно сам.
 *
 * Заодно снимаем ключи интеграций: без них ни один тест не ходит в сеть —
 * `lib/telegram.ts` падает на отсутствии токена до `fetch`, а `lib/ai.ts` —
 * до обращения к модели.
 */
function isolate(t: TestContext): void {
  t.mock.method(console, 'error', () => {});
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  delete process.env.ANTHROPIC_API_KEY;
}

test('POST без TELEGRAM_WEBHOOK_SECRET в окружении отвергается с 401', async (t) => {
  isolate(t);
  delete process.env.TELEGRAM_WEBHOOK_SECRET;

  const res = await POST(makeRequest());

  assert.equal(res.status, 401, 'незаданный секрет не должен открывать вебхук наружу');
});

test('POST при пустом TELEGRAM_WEBHOOK_SECRET отвергается с 401', async (t) => {
  isolate(t);
  // Именно так выглядит переменная, заведённая в панели и оставленная без
  // значения: она существует, но защищать ей нечем.
  process.env.TELEGRAM_WEBHOOK_SECRET = '';

  const res = await POST(makeRequest({ [HEADER]: '' }));

  assert.equal(res.status, 401, 'пустое значение — это отсутствие секрета, а не секрет');
});

test('POST при секрете из одних пробелов отвергается с 401', async (t) => {
  isolate(t);
  process.env.TELEGRAM_WEBHOOK_SECRET = '   ';

  const res = await POST(makeRequest({ [HEADER]: '   ' }));

  assert.equal(res.status, 401, 'пробелы — не секрет; заголовок HTTP их всё равно обрежет');
});

test('POST без заголовка при заданном секрете отвергается с 401', async (t) => {
  isolate(t);
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;

  const res = await POST(makeRequest());

  assert.equal(res.status, 401);
});

test('POST с неверным секретом отвергается с 401', async (t) => {
  isolate(t);
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;

  const res = await POST(makeRequest({ [HEADER]: SECRET + 'x' }));

  assert.equal(res.status, 401);
});

test('POST с верным секретом проходит проверку подлинности', async (t) => {
  isolate(t);
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;

  const res = await POST(makeRequest({ [HEADER]: SECRET }));

  assert.notEqual(res.status, 401, 'настоящий апдейт Telegram не должен отсекаться');
});
