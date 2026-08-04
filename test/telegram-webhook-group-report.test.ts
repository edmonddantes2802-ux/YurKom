/**
 * Команда в рабочей группе видела только сообщение клиента — не то, что ему
 * реально ответил бот. При сбое ИИ это означало, что команда не знала, что
 * клиенту дважды подряд ушёл один и тот же шаблон (см. разбор в WORKLOG,
 * инцидент 13:37–13:38).
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/telegram/webhook/route';
import { waitForBackgroundWork } from '@/lib/background-work';
import { resetAiMemory } from '@/lib/ai-memory';
import { resetWebhookRateLimit } from '@/lib/webhook-rate-limit';
import { resetWebhookDedup } from '@/lib/webhook-dedup';
import { resetChatQueue } from '@/lib/chat-queue';

const SECRET = 'example-webhook-secret-value';
const HEADER = 'x-telegram-bot-api-secret-token';
const GROUP_CHAT_ID = '-100123';
const CLIENT_CHAT_ID = 888;

function makeRequest(updateId: number, text: string): NextRequest {
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
  delete process.env.ANTHROPIC_API_KEY; // ИИ не настроен — гарантированный сбой, ответ уйдёт шаблоном
  resetAiMemory();
  resetWebhookRateLimit();
  resetWebhookDedup();
  resetChatQueue();
  t.after(() => waitForBackgroundWork());
  return t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: true, result: { message_id: 1 } }));
}

function sendMessageBodies(fetched: ReturnType<TestContext['mock']['method']>) {
  return fetched.mock.calls
    .filter((c) => String(c.arguments[0]).endsWith('/sendMessage'))
    .map((c) => JSON.parse(String((c.arguments[1] as RequestInit)?.body ?? '{}')));
}

test('при сбое ИИ в группе видно, что клиенту ушёл шаблон', async (t) => {
  const fetched = isolate(t);

  await POST(makeRequest(1, 'у меня блокировка счетов'));
  await waitForBackgroundWork();

  const toGroup = sendMessageBodies(fetched).filter((b) => String(b.chat_id) === GROUP_CHAT_ID);

  // Пересылка исходного сообщения клиента — она была и раньше.
  assert.ok(
    toGroup.some((b) => String(b.text).includes('у меня блокировка счетов')),
    'пересылка текста клиента должна остаться',
  );

  // Новое: отдельным сообщением видно, ЧТО ответил бот, с пометкой шаблона.
  const report = toGroup.find((b) => String(b.text).includes('ШАБЛОН'));
  assert.ok(report, 'должно быть сообщение с пометкой ШАБЛОН');
});

test('/start не помечается шаблоном сбоя — это штатный, не аварийный ответ', async (t) => {
  const fetched = isolate(t);

  await POST(makeRequest(2, '/start'));
  await waitForBackgroundWork();

  const toGroup = sendMessageBodies(fetched).filter((b) => String(b.chat_id) === GROUP_CHAT_ID);
  const marked = toGroup.some((b) => String(b.text).includes('ШАБЛОН'));

  assert.equal(marked, false, '/start — не сбой модели, помечать как шаблон деградации не нужно');
});
