'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { hit } from '@/lib/analytics';

/**
 * Хиты при клиентской навигации App Router.
 *
 * `ym(id, 'init')` отправляет просмотр только для страницы, на которой
 * счётчик стартовал. Дальше Next меняет маршрут без перезагрузки, и без
 * ручного хита вся сессия схлопывается в один просмотр: переходы с главной
 * на посадочные в статистике не видны.
 *
 * Первый эффект пропускаем — этот просмотр уже отправил `init`.
 */
export default function MetrikaRouteHits() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialHitSkipped = useRef(false);

  useEffect(() => {
    if (!initialHitSkipped.current) {
      initialHitSkipped.current = true;
      return;
    }
    hit(window.location.href);
  }, [pathname, searchParams]);

  return null;
}
