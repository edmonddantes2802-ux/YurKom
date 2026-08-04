/**
 * FALLBACK_REPLY был одной константой на любой сбой ИИ, сколько угодно раз
 * подряд — клиент получал дословно один и тот же текст (см. разбор в
 * WORKLOG, инцидент 13:37–13:38: «Заявка принята...» дважды подряд на два
 * разных сообщения). Плюс текст обещал «юрист свяжется в ближайшее время»
 * круглосуточно, включая ночь, когда это неправда.
 *
 * Тексты — заглушки с понятными именами; финальные формулировки даст
 * пользователь отдельно. Проверяем структурные свойства: день/ночь и
 * первый/повторный сбой дают РАЗНЫЙ текст, ночной вариант не обещает
 * скорость и не даёт телефон.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeReply,
  pickFallbackReply,
  FALLBACK_REPLY_DAY,
  FALLBACK_REPLY_DAY_REPEAT,
  FALLBACK_REPLY_NIGHT,
  FALLBACK_REPLY_NIGHT_REPEAT,
  type AiReply,
} from '@/lib/bot-reply';
import { resetAiMemory, rememberExchange } from '@/lib/ai-memory';
import { resetChatQueue } from '@/lib/chat-queue';
import { PHONE } from '@/lib/contacts';

const NEAR_FUTURE_PROMISE = /ближайшее время/iu;

const ALWAYS_FAILS: AiReply = async () => {
  throw new Error('ai always fails in this test');
};

test('день и ночь дают разные тексты первого сбоя', () => {
  resetAiMemory();
  const day = pickFallbackReply('chat-day', new Date('2026-01-15T11:00:00Z')); // 14:00 МСК
  const night = pickFallbackReply('chat-night', new Date('2026-01-15T00:00:00Z')); // 03:00 МСК

  assert.equal(day, FALLBACK_REPLY_DAY);
  assert.equal(night, FALLBACK_REPLY_NIGHT);
  assert.notEqual(day, night);
});

test('ночной текст (03:00 МСК) не обещает «в ближайшее время» и не даёт телефон', () => {
  resetAiMemory();
  const midnight = new Date('2026-01-15T00:00:00Z'); // 03:00 МСК

  const first = pickFallbackReply('chat-night-1', midnight);
  assert.doesNotMatch(first, NEAR_FUTURE_PROMISE);
  assert.doesNotMatch(first, new RegExp(PHONE.replace(/[+()]/g, '\\$&'), 'u'));

  const repeat = pickFallbackReply('chat-night-1', midnight);
  assert.doesNotMatch(repeat, NEAR_FUTURE_PROMISE);
  assert.doesNotMatch(repeat, new RegExp(PHONE.replace(/[+()]/g, '\\$&'), 'u'));
});

test('дневной текст (14:00 МСК) даёт телефон — в отличие от ночного', () => {
  resetAiMemory();
  const afternoon = new Date('2026-01-15T11:00:00Z'); // 14:00 МСК
  const text = pickFallbackReply('chat-day-1', afternoon);

  assert.match(text, new RegExp(PHONE.replace(/[+()]/g, '\\$&'), 'u'));
});

test('два сбоя ИИ подряд в одном чате дают разные тексты клиенту', async () => {
  resetAiMemory();
  resetChatQueue();
  const chatId = 'repeat-chat';

  const first = await composeReply({ text: 'у меня блокировка счетов', chatId }, { aiReply: ALWAYS_FAILS });
  const second = await composeReply(
    { text: 'так со мной свяжутся или ещё писать?', chatId },
    { aiReply: ALWAYS_FAILS },
  );

  assert.equal(first.via, 'fallback');
  assert.equal(second.via, 'fallback');
  assert.notEqual(first.text, second.text, 'второй шаблон не должен дословно повторять первый');
});

test('после сбоя ИИ выбирается вариант «повтор», а не текст первого сбоя', () => {
  resetAiMemory();
  const now = new Date('2026-01-15T11:00:00Z'); // 14:00 МСК, день
  const chatId = 'chat-seq';

  const first = pickFallbackReply(chatId, now);
  assert.equal(first, FALLBACK_REPLY_DAY);

  // Имитируем, что этот текст только что реально ушёл клиенту.
  rememberExchange(chatId, 'у меня блокировка счетов', first);

  const second = pickFallbackReply(chatId, now);
  assert.equal(second, FALLBACK_REPLY_DAY_REPEAT);
});

test('повтор ночью — тоже отдельный текст без обещания и телефона', () => {
  resetAiMemory();
  const now = new Date('2026-01-15T00:00:00Z'); // 03:00 МСК
  const chatId = 'chat-seq-night';

  rememberExchange(chatId, 'у меня блокировка счетов', FALLBACK_REPLY_NIGHT);
  const second = pickFallbackReply(chatId, now);

  assert.equal(second, FALLBACK_REPLY_NIGHT_REPEAT);
  assert.doesNotMatch(second, NEAR_FUTURE_PROMISE);
  assert.doesNotMatch(second, new RegExp(PHONE.replace(/[+()]/g, '\\$&'), 'u'));
});
