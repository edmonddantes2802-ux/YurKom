'use client';

/**
 * Обёртка над Яндекс.Метрикой. Никакой логики поверх — только гарантия, что
 * счётчик, которого нет (не загрузился, заблокирован адблоком, отключён на
 * localhost), не уронит обработчик клика по телефону.
 *
 * ID берётся ТОЛЬКО из NEXT_PUBLIC_METRIKA_ID. Хардкод номера счётчика
 * запрещён: на стенде и в проде счётчики разные, а зашитый номер молча
 * пишет тестовый трафик в боевую статистику.
 */

export type MetrikaGoal =
  /** Первый фокус в форме-квалификаторе. */
  | 'qualifier_started'
  /** Нажата кнопка отправки (ещё не знаем, дошло ли). */
  | 'qualifier_submitted'
  /** Заявка принята сервером — целевое действие. */
  | 'lead_form'
  | 'click_phone'
  | 'click_telegram';

declare global {
  interface Window {
    ym?: (id: number, action: string, ...args: unknown[]) => void;
  }
}

export const METRIKA_ID = Number(process.env.NEXT_PUBLIC_METRIKA_ID) || 0;

/**
 * Локальная разработка счётчик не трогает: иначе отладочные заходы и
 * тестовые отправки формы попадают в боевую статистику и портят конверсию.
 */
export function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost')
  );
}

/** Метрику вообще имеет смысл дёргать? ID задан, мы в браузере и не на localhost. */
export function isMetrikaEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (!METRIKA_ID) return false;
  return !isLocalHost(window.location.hostname);
}

/**
 * Единственная точка вызова `window.ym`. Любая ошибка внутри счётчика
 * гасится: аналитика не должна ломать пользовательский сценарий.
 */
function call(action: string, ...args: unknown[]): void {
  if (!isMetrikaEnabled()) return;
  const ym = window.ym;
  if (typeof ym !== 'function') return;
  try {
    ym(METRIKA_ID, action, ...args);
  } catch {
    // счётчик не загрузился или упал — молча продолжаем
  }
}

export function reachGoal(goal: MetrikaGoal, params?: Record<string, unknown>): void {
  call('reachGoal', goal, params);
}

/** Просмотр страницы при клиентской навигации App Router. */
export function hit(url: string): void {
  call('hit', url);
}

/** Собирает utm_* из текущего URL (и сохранённые ранее в sessionStorage). */
export function collectUtm(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const utm: Record<string, string> = {};
  try {
    const stored = sessionStorage.getItem('utm_params');
    if (stored) Object.assign(utm, JSON.parse(stored));
  } catch {
    // sessionStorage недоступен — игнорируем
  }
  const params = new URLSearchParams(window.location.search);
  params.forEach((value, key) => {
    if (key.startsWith('utm_')) utm[key] = value;
  });
  try {
    if (Object.keys(utm).length > 0) {
      sessionStorage.setItem('utm_params', JSON.stringify(utm));
    }
  } catch {
    // игнорируем
  }
  return utm;
}
