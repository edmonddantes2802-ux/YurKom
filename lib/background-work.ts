/**
 * Трекинг фоновых задач вебхука бота.
 *
 * Ответ Telegram уходит сразу после приёма апдейта (см. `app/api/telegram/
 * webhook/route.ts`), а пересылка в группу, ИИ и доставка клиенту продолжают
 * работать уже после него — как fire-and-forget промис, который никто не
 * awaits в обработчике запроса. Вынесено из route.ts отдельным модулем:
 * Next.js App Router разрешает в файле роута только экспорт HTTP-хендлеров и
 * нескольких служебных констант (`runtime`, `config` и т.п.) — произвольный
 * export вроде `waitForBackgroundWork` ломает генерируемую Next типизацию
 * маршрута.
 */

const pendingWork = new Set<Promise<void>>();

/** Регистрирует фоновую задачу — используется только внутри роута вебхука. */
export function trackBackground(promise: Promise<void>): void {
  pendingWork.add(promise);
  void promise.finally(() => pendingWork.delete(promise));
}

/**
 * Только для тестов: дождаться, пока весь фоновый конвейер (пересылка, ИИ,
 * доставка) уже запущенных апдейтов закончит работу. В проде не вызывается —
 * ответ Telegram уходит до завершения этой работы, в этом и состоит смысл
 * фоновой обработки.
 */
export async function waitForBackgroundWork(): Promise<void> {
  while (pendingWork.size > 0) {
    await Promise.allSettled([...pendingWork]);
  }
}
