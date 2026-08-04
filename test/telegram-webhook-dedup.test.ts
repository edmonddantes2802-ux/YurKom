/**
 * Идемпотентность по update_id.
 *
 * Telegram ретраит доставку, если не получил 200 вовремя — тот же update_id
 * приходит снова. Без дедупликации повтор прогоняет весь конвейер заново:
 * вторая пересылка в группу и второй ответ клиенту на одно и то же сообщение
 * (см. разбор в WORKLOG, инцидент 13:36–13:38).
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/telegram/webhook/route';
import { waitForBackgroundWork } from '@/lib/background-work';
import { resetAiMemory } from '@/lib/ai-memory';
import { resetWebhookRateLimit } from '@/lib/webhook-rate-limit';
import { resetWebhookDedup } from '@/lib/webhook-dedup';

const SECRET = 'example-webhook-secret-value';
const HEADER = 'x-telegram-bot-api-secret-token';
const GROUP_CHAT_ID = '-100123';
const CLIENT_CHAT_ID = 555;

function makeRequest(updateId: number, text = 'у меня блокировка счетов'): NextRequest {
  return new NextRequest('https://example.test/api/telegram/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', [HEADER]: SECRET },
    body: JSON.stringify({
      update_id: updateId,
      message: {
        message_id: 10,
        chat: { id: CLIENT_CHAT_ID, type: 'private' },
        from: { id: CLIENT_CHAT_ID },
        text,
      },
    }),
  });
}

function isolate(t: TestContext) {
  t.mock.method(console, 'error', () => {});
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  process.env.TELEGRAM_BOT_TOKEN = 'example-bot-token-value';
  process.env.TELEGRAM_CHAT_ID = GROUP_CHAT_ID;
  delete process.env.ANTHROPIC_API_KEY;
  resetAiMemory();
  resetWebhookRateLimit();
  resetWebhookDedup();
  return t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: true, result: { message_id: 1 } }));
}

/** Только вызовы sendMessage — sendChatAction («печатает…») бьёт по тому же chat_id и портит счёт. */
function sendMessageBodies(fetched: ReturnType<TestContext['mock']['method']>) {
  return fetched.mock.calls
    .filter((c) => String(c.arguments[0]).endsWith('/sendMessage'))
    .map((c) => JSON.parse(String((c.arguments[1] as RequestInit)?.body ?? '{}')));
}

test('повторная доставка одного update_id: одна пересылка в группу, один ответ клиенту', async (t) => {
  const fetched = isolate(t);

  const res1 = await POST(makeRequest(42));
  const res2 = await POST(makeRequest(42));
  await waitForBackgroundWork();

  assert.equal(res1.status, 200);
  assert.equal(res2.status, 200, 'повтор тоже отвечает 200 — иначе Telegram будет ретраить бесконечно');

  const bodies = sendMessageBodies(fetched);
  // В группу на одно обращение уходит два сообщения (пересылка текста
  // клиента + отчёт о том, что ответил бот) — считаем именно пересылки.
  const forwardsToGroup = bodies.filter(
    (b) => String(b.chat_id) === GROUP_CHAT_ID && String(b.text).includes('Сообщение боту'),
  );
  const toClient = bodies.filter((b) => String(b.chat_id) === String(CLIENT_CHAT_ID));

  assert.equal(forwardsToGroup.length, 1, 'пересылка в группу должна произойти только один раз');
  assert.equal(toClient.length, 1, 'ответ клиенту должен уйти только один раз');
});

test('разные update_id одного чата обрабатываются независимо', async (t) => {
  const fetched = isolate(t);

  await POST(makeRequest(101, 'привет'));
  await POST(makeRequest(102, 'ау'));
  await waitForBackgroundWork();

  const bodies = sendMessageBodies(fetched);
  const forwardsToGroup = bodies.filter(
    (b) => String(b.chat_id) === GROUP_CHAT_ID && String(b.text).includes('Сообщение боту'),
  );
  assert.equal(forwardsToGroup.length, 2, 'два разных сообщения — это два разных обращения, оба должны переслаться');
});
