/**
 * F4: потолки, не привязанные к идентификатору из тела запроса.
 *
 * Квота модели считалась на `chat.id`, который приходит в теле апдейта.
 * Инкремент значения в каждом запросе давал каждому запросу свежую квоту —
 * ограничения по-настоящему не было, а каждый пропущенный запрос это платный
 * вызов модели с таймаутом до 25 секунд. У самого POST вебхука лимита не было
 * вовсе.
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/telegram/webhook/route';
import { consumeQuota, consumeGlobalQuota, resetAiMemory } from '@/lib/ai-memory';
import { resetWebhookRateLimit, WEBHOOK_MAX_PER_WINDOW } from '@/lib/webhook-rate-limit';
import { resetWebhookDedup } from '@/lib/webhook-dedup';
import { AI_GLOBAL_QUOTA_LIMIT } from '@/lib/ai-config';

const SECRET = 'example-webhook-secret-value';
const HEADER = 'x-telegram-bot-api-secret-token';

function isolate(t: TestContext): void {
  t.mock.method(console, 'error', () => {});
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  delete process.env.ANTHROPIC_API_KEY;
  resetAiMemory();
  resetWebhookRateLimit();
  resetWebhookDedup();
}

/**
 * Апдейт без текста: роут отвечает на нём сразу после лимитов, не трогая ни
 * модель, ни сеть. Ровно то, что нужно, чтобы измерять пропускную способность
 * самого лимита, а не скорость доставки ответа.
 */
function makeRequest(chatId: number): NextRequest {
  return new NextRequest('https://example.test/api/telegram/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', [HEADER]: SECRET },
    body: JSON.stringify({ update_id: chatId, message: { chat: { id: chatId, type: 'private' } } }),
  });
}

test('поток запросов с разными chat.id упирается в лимит самого вебхука', async (t) => {
  isolate(t);

  const attempts = WEBHOOK_MAX_PER_WINDOW * 5;
  let accepted = 0;
  let throttled = 0;

  for (let i = 0; i < attempts; i++) {
    // Каждый запрос представляется новым чатом — именно так обходилась квота.
    const res = await POST(makeRequest(i));
    if (res.status === 429) throttled++;
    else accepted++;
  }

  assert.equal(accepted, WEBHOOK_MAX_PER_WINDOW, 'смена chat.id не должна давать новый лимит');
  assert.equal(throttled, attempts - WEBHOOK_MAX_PER_WINDOW);
});

test('общий потолок вызовов модели не обходится сменой chat.id', (t) => {
  isolate(t);

  let allowed = 0;
  // На порядок больше общего потолка, каждый раз новый чат: личная квота
  // (AI_QUOTA_LIMIT на чат) при таком обходе не тратится вообще.
  for (let i = 0; i < AI_GLOBAL_QUOTA_LIMIT * 10; i++) {
    const chatId = `chat-${i}`;
    if (consumeQuota(chatId).allowed && consumeGlobalQuota().allowed) allowed++;
  }

  assert.equal(allowed, AI_GLOBAL_QUOTA_LIMIT, 'общий потолок должен считаться на процесс, а не на чат');
});

test('общий потолок не мешает одному чату выбрать личную квоту', (t) => {
  isolate(t);

  let allowed = 0;
  for (let i = 0; i < 5; i++) {
    if (consumeQuota('один-и-тот-же-чат').allowed && consumeGlobalQuota().allowed) allowed++;
  }

  assert.equal(allowed, 5, 'нормальный диалог не должен упираться в общий потолок');
});

test('resetAiMemory обнуляет и общий потолок', (t) => {
  isolate(t);

  for (let i = 0; i < AI_GLOBAL_QUOTA_LIMIT; i++) consumeGlobalQuota();
  assert.equal(consumeGlobalQuota().allowed, false, 'потолок должен быть выбран');

  resetAiMemory();

  assert.equal(consumeGlobalQuota().allowed, true);
});
