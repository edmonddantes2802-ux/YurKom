/**
 * Очередь на chatId: два быстрых сообщения одного клиента подряд не должны
 * читать историю диалога параллельно — иначе второй вызов не видит первый
 * обмен, и бот здоровается дважды вместо связного разговора (см. разбор в
 * WORKLOG, инцидент 13:36–13:38: «Привет!» и «Ау» в одну минуту).
 *
 * Фейковый aiReply вместо реального похода в Anthropic: важен сам факт
 * гонки за getHistory(chatId), а не ответ модели. Он читает историю
 * синхронно при вызове (как это делает настоящий aiReply в lib/ai.ts) и
 * искусственно «думает» — так гонка становится детерминированной.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeReply, type AiReply } from '@/lib/bot-reply';
import { getHistory, resetAiMemory } from '@/lib/ai-memory';
import { sleep } from '@/lib/retry';
import { resetChatQueue } from '@/lib/chat-queue';

test('второй composeReply одного chatId видит первый обмен в getHistory', async () => {
  resetAiMemory();
  resetChatQueue();

  const chatId = 'race-chat';
  const seenHistoryLengths: number[] = [];

  const fakeAiReply: AiReply = async ({ chatId: id }) => {
    seenHistoryLengths.push(getHistory(id).length);
    await sleep(30); // имитируем время похода в модель
    return `ответ №${seenHistoryLengths.length}`;
  };

  await Promise.all([
    composeReply({ text: 'привет', chatId }, { aiReply: fakeAiReply }),
    composeReply({ text: 'ау', chatId }, { aiReply: fakeAiReply }),
  ]);

  assert.deepEqual(
    seenHistoryLengths,
    [0, 2],
    'второй вызов должен стартовать только после того, как первый дописал историю (2 реплики: клиент+ассистент)',
  );
});

test('разные chatId не ждут друг друга', async () => {
  resetAiMemory();
  resetChatQueue();

  const order: string[] = [];
  const fakeAiReply: AiReply = async ({ chatId: id, text }) => {
    order.push(`start:${id}`);
    // Первый чат «думает» дольше — если бы очередь была общей (не по chatId),
    // второй чат ждал бы его и финишировал бы намного позже.
    await sleep(id === 'chat-a' ? 60 : 5);
    order.push(`end:${id}`);
    return text;
  };

  await Promise.all([
    composeReply({ text: 'привет', chatId: 'chat-a' }, { aiReply: fakeAiReply }),
    composeReply({ text: 'привет', chatId: 'chat-b' }, { aiReply: fakeAiReply }),
  ]);

  // chat-b должен успеть полностью отработать до того, как медленный chat-a закончит.
  assert.deepEqual(order, ['start:chat-a', 'start:chat-b', 'end:chat-b', 'end:chat-a']);
});
