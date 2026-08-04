/**
 * F2, защита в глубину: в приватном чате отправитель обязан совпадать с чатом.
 *
 * `chat.id` приходит в теле апдейта и определяет, КОМУ бот отправит ответ.
 * Проверки принадлежности не было никакой, поэтому вся защита от рассылки
 * произвольным людям от имени официального бота держалась на одном значении —
 * секрете вебхука, общем на весь трафик и не ротируемом. У настоящего
 * приватного сообщения `from.id` всегда равен `chat.id`: чат один на одного, и
 * писать в него может только его собеседник. Подставленный адресат этому
 * равенству не удовлетворяет.
 *
 * В группах равенства нет и быть не может — там `chat.id` это идентификатор
 * группы, а `from.id` конкретного участника. Правило применяется только к
 * приватным чатам.
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/telegram/webhook/route';
import { waitForBackgroundWork } from '@/lib/background-work';
import { resetWebhookRateLimit } from '@/lib/webhook-rate-limit';
import { resetAiMemory } from '@/lib/ai-memory';
import { resetWebhookDedup } from '@/lib/webhook-dedup';

const SECRET = 'example-webhook-secret-value';
const HEADER = 'x-telegram-bot-api-secret-token';

const VICTIM = 111;
const ATTACKER = 999;

type ChatShape = { id: number; type?: string };

function makeRequest(chat: ChatShape, from: { id: number } | undefined): NextRequest {
  return new NextRequest('https://example.test/api/telegram/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', [HEADER]: SECRET },
    body: JSON.stringify({
      update_id: 1,
      message: { message_id: 10, chat, from, text: 'арестовали счёт, что делать' },
    }),
  });
}

/**
 * Токен задан, а `fetch` подменён — так видно, ушло ли наружу хоть одно
 * сообщение. Без токена `lib/telegram.ts` выходит раньше, и тест доказывал бы
 * не то, что нужно.
 */
function isolate(t: TestContext) {
  t.mock.method(console, 'error', () => {});
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  process.env.TELEGRAM_BOT_TOKEN = 'example-bot-token-value';
  process.env.TELEGRAM_CHAT_ID = '-100123';
  delete process.env.ANTHROPIC_API_KEY;
  resetAiMemory();
  resetWebhookRateLimit();
  // update_id в makeRequest фиксирован (1) — без сброса второй тест этого
  // файла получил бы «уже видели» вместо настоящей проверки.
  resetWebhookDedup();
  // Ответ POST больше не ждёт конвейер (см. шаг 2) — без этого фоновая
  // задача (реальные паузы deliverReply, 1,5–4 с) дожила бы до следующего
  // теста и дёргала fetch уже после того, как его мок здесь восстановлен.
  t.after(() => waitForBackgroundWork());
  return t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ ok: true, result: { message_id: 1 } }),
  );
}

test('приватный чат: подставленный адресат отвергается', async (t) => {
  const fetched = isolate(t);

  const res = await POST(makeRequest({ id: VICTIM, type: 'private' }, { id: ATTACKER }));

  assert.equal(res.status, 403, 'ответ не должен уходить в чужой чат');
  assert.equal(fetched.mock.callCount(), 0, 'наружу не должно уйти ни одного сообщения');
});

test('приватный чат без отправителя отвергается', async (t) => {
  const fetched = isolate(t);

  const res = await POST(makeRequest({ id: VICTIM, type: 'private' }, undefined));

  assert.equal(res.status, 403, 'проверить принадлежность нечем — значит, не пропускаем');
  assert.equal(fetched.mock.callCount(), 0);
});

test('чат без указанного типа проверяется как приватный', async (t) => {
  const fetched = isolate(t);

  // Иначе правило обходится простым отбрасыванием поля type из тела запроса.
  const res = await POST(makeRequest({ id: VICTIM }, { id: ATTACKER }));

  assert.equal(res.status, 403, 'отсутствие типа не должно снимать проверку');
  assert.equal(fetched.mock.callCount(), 0);
});

test('приватный чат: собственное сообщение проходит', async (t) => {
  isolate(t);

  const res = await POST(makeRequest({ id: VICTIM, type: 'private' }, { id: VICTIM }));

  assert.notEqual(res.status, 403, 'настоящий диалог с клиентом ломать нельзя');
});

test('группа: несовпадение отправителя и чата — норма', async (t) => {
  isolate(t);

  const res = await POST(makeRequest({ id: -100500, type: 'group' }, { id: ATTACKER }));

  assert.notEqual(res.status, 403, 'в группе chat.id — это группа, а не участник');
});

test('супергруппа: несовпадение отправителя и чата — норма', async (t) => {
  isolate(t);

  const res = await POST(makeRequest({ id: -100500, type: 'supergroup' }, { id: ATTACKER }));

  assert.notEqual(res.status, 403);
});
