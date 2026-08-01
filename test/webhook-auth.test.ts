/**
 * F1, уровень модуля: сама проверка секрета вебхука.
 *
 * Здесь фиксируется контракт, который выше по стеку превращается в 401:
 * нет секрета — не пропускаем никого; есть — сравниваем целиком и не
 * подсказываем длину.
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyWebhookSecret,
  warnIfWebhookSecretMissing,
  __resetWebhookSecretWarning,
} from '@/lib/webhook-auth';

const SECRET = 'example-webhook-secret-value';

function withEnv(t: TestContext, value: string | undefined): void {
  if (value === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
  else process.env.TELEGRAM_WEBHOOK_SECRET = value;
  t.mock.method(console, 'error', () => {});
}

test('без секрета в окружении не проходит ни один заголовок', (t) => {
  withEnv(t, undefined);

  assert.equal(verifyWebhookSecret(null), false);
  assert.equal(verifyWebhookSecret(''), false);
  assert.equal(verifyWebhookSecret('что угодно'), false);
  // Отдельно: пустой заголовок не должен «совпасть» с пустым секретом.
  assert.equal(verifyWebhookSecret(undefined), false);
});

test('верный секрет проходит, любое отклонение — нет', (t) => {
  withEnv(t, SECRET);

  assert.equal(verifyWebhookSecret(SECRET), true);
  assert.equal(verifyWebhookSecret(SECRET + 'x'), false, 'длиннее на символ');
  assert.equal(verifyWebhookSecret(SECRET.slice(0, -1)), false, 'короче на символ');
  assert.equal(
    verifyWebhookSecret(SECRET.slice(0, -1) + 'X'),
    false,
    'та же длина, отличается последний символ',
  );
  assert.equal(verifyWebhookSecret(SECRET.toUpperCase()), false, 'регистр значим');
  assert.equal(verifyWebhookSecret(null), false);
});

test('отсутствие секрета логируется при старте ровно один раз', (t) => {
  withEnv(t, undefined);
  __resetWebhookSecretWarning();
  const logged = t.mock.method(console, 'error', () => {});

  warnIfWebhookSecretMissing();
  warnIfWebhookSecretMissing();
  warnIfWebhookSecretMissing();

  assert.equal(logged.mock.callCount(), 1, 'предупреждение не должно повторяться на каждый запрос');
  assert.match(String(logged.mock.calls[0].arguments[0]), /WEBHOOK_SECRET_MISSING/);
});

test('при заданном секрете предупреждение не пишется', (t) => {
  withEnv(t, SECRET);
  __resetWebhookSecretWarning();
  const logged = t.mock.method(console, 'error', () => {});

  warnIfWebhookSecretMissing();

  assert.equal(logged.mock.callCount(), 0);
});
