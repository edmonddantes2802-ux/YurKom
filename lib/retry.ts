/**
 * Общий ретрай с экспоненциальной задержкой для исходящих HTTP-вызовов
 * (Anthropic, Telegram). Не решает САМ, что ретраить: вызывающий передаёт
 * `isRetryable`, потому что критерий разный — у Anthropic это типы ошибок
 * SDK (`APIConnectionError`, `status >= 500`), у Telegram — свой разбор
 * ответа fetch (см. `lib/telegram.ts`).
 *
 * Бюджет времени вызывающий считает сам: `attemptFn` получает номер попытки
 * и может дать ей укороченный таймаут, если общий лимit (например, 8 секунд
 * у бота) уже частично потрачен.
 */

export function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export type RetryPolicy<E = unknown> = {
  /** Сколько всего попыток, включая первую. */
  attempts: number;
  /** Задержка ПЕРЕД попыткой i+1: delaysMs[0] — перед 2-й попыткой и т.д. */
  delaysMs: number[];
  /** true — попытку стоит повторить (сетевая ошибка/5xx), false — 4xx и подобное. */
  isRetryable: (err: E) => boolean;
};

/**
 * Прогоняет `attemptFn` по политике `policy`. Бросает исключение последней
 * попытки, если все они провалились или ошибка оказалась неретраибельной.
 */
export async function withRetry<T>(
  attemptFn: (attempt: number) => Promise<T>,
  policy: RetryPolicy,
  onRetry?: (attempt: number, attempts: number, err: unknown, delayMs: number) => void,
): Promise<T> {
  for (let attempt = 1; attempt <= policy.attempts; attempt++) {
    try {
      return await attemptFn(attempt);
    } catch (err) {
      const isLastAttempt = attempt === policy.attempts;
      if (isLastAttempt || !policy.isRetryable(err)) throw err;
      const delay = policy.delaysMs[attempt - 1] ?? 0;
      onRetry?.(attempt, policy.attempts, err, delay);
      await sleep(delay);
    }
  }
  // Недостижимо: цикл либо возвращает результат, либо бросает исключение.
  throw new Error('withRetry: unreachable');
}
