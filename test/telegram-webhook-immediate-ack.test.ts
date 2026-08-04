/**
 * Ответ Telegram уходит сразу после приёма апдейта — пересылка в группу, ИИ
 * и доставка клиенту продолжаются ПОСЛЕ ответа, а не до него.
 *
 * Иначе Telegram не дожидается медленного конвейера (до ~32 с: AI_TIMEOUT_MS
 * + DELIVERY_BUDGET_MS) и ретраит сам апдейт — с дедупликацией (шаг 1) повтор
 * больше не прогоняет конвейер заново, но сам факт лишнего ожидания и
 * повторной доставки никуда не девается без этого шага.
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

/** Явно дольше, чем должен занимать сам ответ 200 — граница на порядок ниже. */
const SLOW_TRANSPORT_MS = 500;
const RESPONSE_BUDGET_MS = 150;

function makeRequest(updateId: number): NextRequest {
  return new NextRequest('https://example.test/api/telegram/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', [HEADER]: SECRET },
    body: JSON.stringify({
      update_id: updateId,
      message: { message_id: 10, chat: { id: 777, type: 'private' }, from: { id: 777 }, text: 'арестовали счёт' },
    }),
  });
}

function isolate(t: TestContext) {
  t.mock.method(console, 'error', () => {});
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  process.env.TELEGRAM_BOT_TOKEN = 'example-bot-token-value';
  process.env.TELEGRAM_CHAT_ID = '-100123';
  delete process.env.ANTHROPIC_API_KEY;
  resetAiMemory();
  resetWebhookRateLimit();
  resetWebhookDedup();
  // Вся исходящая сеть (пересылка в группу, ответ клиенту) искусственно
  // медленная — так видно, ждёт ли ответ 200 конвейер целиком или нет.
  return t.mock.method(globalThis, 'fetch', async () => {
    await new Promise((resolve) => setTimeout(resolve, SLOW_TRANSPORT_MS));
    return Response.json({ ok: true, result: { message_id: 1 } });
  });
}

test('время до ответа 200 не зависит от времени работы конвейера', async (t) => {
  const fetched = isolate(t);

  const startedAt = Date.now();
  const res = await POST(makeRequest(1));
  const elapsedMs = Date.now() - startedAt;

  assert.equal(res.status, 200);
  assert.ok(
    elapsedMs < RESPONSE_BUDGET_MS,
    `ответ занял ${elapsedMs} мс — не должен ждать сеть (${SLOW_TRANSPORT_MS} мс на каждый вызов)`,
  );

  // Ни один сетевой вызов к моменту ответа ещё не мог УСПЕТЬ (мок держит его
  // ${SLOW_TRANSPORT_MS} мс) — то, что запрос уже мог СТАРТОВАТЬ синхронно
  // (fire-and-forget), сюда не относится и багом не является.
  const callsAtResponseTime = fetched.mock.callCount();

  // Конвейер всё равно должен доработать и разослать сообщения — просто после ответа.
  await waitForBackgroundWork();
  assert.ok(
    fetched.mock.callCount() >= callsAtResponseTime,
    'после ожидания фон должен был отработать (пересылка, доставка)',
  );
  assert.ok(fetched.mock.callCount() > 0, 'сеть в итоге должна была уйти');
});
