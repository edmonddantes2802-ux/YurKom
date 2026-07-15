'use client';

export type MetrikaGoal =
  | 'qualifier_started'
  | 'qualifier_submitted'
  | 'lead_created'
  | 'telegram_click'
  | 'phone_click';

declare global {
  interface Window {
    ym?: (id: number, action: string, goal: string, params?: Record<string, unknown>) => void;
  }
}

const METRIKA_ID = Number(process.env.NEXT_PUBLIC_METRIKA_ID);

export function reachGoal(goal: MetrikaGoal, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  if (!METRIKA_ID || !window.ym) return;
  window.ym(METRIKA_ID, 'reachGoal', goal, params);
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
