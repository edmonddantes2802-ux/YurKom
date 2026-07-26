/**
 * Точка вставки ИИ-ответа для бота-секретаря.
 *
 * ИИ здесь — НЕОБЯЗАТЕЛЬНОЕ звено. Пока `aiReply === null`, бот отвечает
 * шаблоном; ничего больше отключать не нужно. Чтобы включить ИИ, достаточно
 * заменить `null` на функцию — вебхук, пересылка в группу и деградация
 * останутся как есть.
 *
 * Контракт жёсткий: функция либо возвращает текст ответа, либо бросает
 * исключение. Всё остальное (таймаут 8 секунд, ошибки, rate limit, пустой
 * ответ) обрабатывает `lib/bot-reply.ts` — клиент в любом случае получает
 * ответ.
 *
 * Пример реализации (Anthropic SDK, `npm i @anthropic-ai/sdk`):
 *
 * ```ts
 * import Anthropic from '@anthropic-ai/sdk';
 *
 * const client = new Anthropic(); // ключ из ANTHROPIC_API_KEY, в коде его нет
 *
 * export const aiReply: AiReply = async ({ text }) => {
 *   const response = await client.messages.create({
 *     model: 'claude-opus-5',
 *     max_tokens: 1024,
 *     system: 'Ты — секретарь юридической антикризисной службы «Митрагост». ...',
 *     messages: [{ role: 'user', content: text }],
 *   });
 *   return response.content
 *     .filter((block) => block.type === 'text')
 *     .map((block) => block.text)
 *     .join('\n')
 *     .trim();
 * };
 * ```
 *
 * Что учесть при включении:
 * - ключ только из окружения (`ANTHROPIC_API_KEY`), никогда в коде и в git;
 * - системный промпт должен запрещать давать правовые заключения и обещать
 *   исход: задача бота — принять ситуацию и передать юристу;
 * - свой таймаут внутри задавать не обязательно, 8 секунд снаружи уже есть.
 */

export type AiReplyInput = {
  /** Текст сообщения клиента. */
  text: string;
  /** Чат клиента — если понадобится история переписки. */
  chatId: string;
};

export type AiReply = (input: AiReplyInput) => Promise<string>;

/** ИИ пока не подключён: бот отвечает шаблоном. Заменить на функцию — и он включится. */
export const aiReply: AiReply | null = null;
