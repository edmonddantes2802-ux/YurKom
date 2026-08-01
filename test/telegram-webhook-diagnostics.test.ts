/**
 * F5: публичный GET на вебхуке отдавал состав конфигурации и на каждый запрос
 * ходил в две внешние сети.
 *
 * `configured.webhookSecret: false` — это прямая наводка, что защита сейчас не
 * настроена, доступная одним curl. А два исходящих запроса с таймаутом 3 с на
 * каждый вызов превращают дешёвый запрос в удержание серверных ресурсов.
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/telegram/webhook/route';

const SECRET = 'example-webhook-secret-value';
const HEADER = 'x-telegram-bot-api-secret-token';

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('https://example.test/api/telegram/webhook', { method: 'GET', headers });
}

/** Считает исходящие вызовы и не выпускает тест в сеть. */
function stubFetch(t: TestContext) {
  return t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 200 }));
}

function isolate(t: TestContext): void {
  t.mock.method(console, 'error', () => {});
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  process.env.TELEGRAM_BOT_TOKEN = 'example-bot-token-value';
  process.env.TELEGRAM_CHAT_ID = '-100123';
}

test('GET без секрета не раскрывает состав конфигурации', async (t) => {
  isolate(t);
  stubFetch(t);

  const body = await (await GET(makeRequest())).json();

  assert.equal(body.configured, undefined, 'состав настроенных секретов — не публичные данные');
  assert.equal(body.network, undefined, 'результаты пингов тоже не для публики');
});

test('GET без секрета не делает ни одного исходящего запроса', async (t) => {
  isolate(t);
  const fetched = stubFetch(t);

  await GET(makeRequest());

  assert.equal(fetched.mock.callCount(), 0, 'публичная ручка не должна ходить наружу');
});

test('GET без секрета остаётся признаком живости роута', async (t) => {
  isolate(t);
  stubFetch(t);

  const res = await GET(makeRequest());
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.route, 'telegram-webhook');
});

test('GET с верным секретом отдаёт полную диагностику', async (t) => {
  isolate(t);
  const fetched = stubFetch(t);

  const body = await (await GET(makeRequest({ [HEADER]: SECRET }))).json();

  assert.equal(typeof body.configured, 'object', 'своим ручка остаётся полезной');
  assert.equal(body.configured.webhookSecret, true);
  assert.equal(typeof body.network, 'object');
  assert.equal(fetched.mock.callCount(), 2, 'пинги делаются только по секрету');
});

test('GET с неверным секретом диагностику не отдаёт', async (t) => {
  isolate(t);
  const fetched = stubFetch(t);

  const body = await (await GET(makeRequest({ [HEADER]: SECRET + 'x' }))).json();

  assert.equal(body.configured, undefined);
  assert.equal(fetched.mock.callCount(), 0);
});
