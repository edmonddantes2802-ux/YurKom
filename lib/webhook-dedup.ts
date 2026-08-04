/**
 * Дедупликация повторной доставки одного апдейта Telegram.
 *
 * Telegram ретраит доставку, если не получил 200 вовремя — тот же update_id
 * приходит снова. Без защиты повтор прогоняет весь конвейер заново: вторая
 * пересылка в рабочую группу и второй ответ клиенту на одно и то же
 * сообщение (см. разбор в WORKLOG, инцидент 13:36–13:38). Ключ — update_id,
 * Telegram присваивает его каждому апдейту и не переиспользует.
 *
 * Скользящее окно в памяти процесса — тот же принцип, что у остальных
 * лимитов (см. lib/rate-limit.ts): перезапуск контейнера окно обнуляет, при
 * нескольких инстансах приложения у каждого своё. Для одного
 * standalone-контейнера, которым проект и деплоится, этого достаточно.
 */

/**
 * С запасом больше, чем может занять весь конвейер (до ~32 с: AI_TIMEOUT_MS
 * + DELIVERY_BUDGET_MS) и чем Telegram обычно ждёт перед повторной
 * доставкой — повтор, пришедший спустя это окно, уже не тот же самый сбой,
 * а отдельное новое обращение.
 */
export const UPDATE_DEDUP_WINDOW_MS = 10 * 60 * 1000;

const seen = new Map<number, number>();

function prune(now: number): void {
  for (const [id, ts] of seen) {
    if (now - ts > UPDATE_DEDUP_WINDOW_MS) seen.delete(id);
  }
}

/**
 * Отмечает апдейт как обработанный. `true` — это повтор в пределах окна,
 * вызывающий не должен запускать конвейер заново. `false` — апдейт новый,
 * место в окне уже занято.
 *
 * `updateId` не задан — дедупликация невозможна, пропускаем как уникальный:
 * блокировать обработку из-за отсутствия ключа было бы неверным fail-closed
 * там, где закрывать нечего.
 */
export function isDuplicateUpdate(updateId: number | undefined, now = Date.now()): boolean {
  if (typeof updateId !== 'number') return false;
  prune(now);
  if (seen.has(updateId)) return true;
  seen.set(updateId, now);
  return false;
}

/** Только для тестов и диагностики. */
export function resetWebhookDedup(): void {
  seen.clear();
}
