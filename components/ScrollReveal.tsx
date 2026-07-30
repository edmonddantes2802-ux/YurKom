'use client';

import { useEffect } from 'react';

export default function ScrollReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (els.length === 0) return;

    const reveal = (el: Element) => el.classList.add('visible');

    // Нет поддержки observer или reduced-motion → показываем всё сразу.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      els.forEach(reveal);
      return;
    }

    // JS доступен → включаем «предстартовое» скрытое состояние только сейчас,
    // чтобы при выключенном JS контент оставался видимым (graceful degradation).
    els.forEach((el) => el.classList.add('reveal-ready'));

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            reveal(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -8% 0px' },
    );

    // Сперва все чтения geometry, потом все записи classList — иначе на
    // каждой итерации чтение после чужой записи форсирует синхронный layout
    // (layout thrashing), и на N элементах это N лишних пересчётов подряд.
    const viewportHeight = window.innerHeight;
    const aboveFold: HTMLElement[] = [];
    const belowFold: HTMLElement[] = [];
    els.forEach((el) => {
      (el.getBoundingClientRect().top < viewportHeight ? aboveFold : belowFold).push(el);
    });
    aboveFold.forEach(reveal);
    belowFold.forEach((el) => observer.observe(el));

    // Страховочная сеть: ничего не должно остаться невидимым навсегда.
    const failSafe = window.setTimeout(() => {
      const height = window.innerHeight;
      const toReveal = els.filter((el) => el.getBoundingClientRect().top < height);
      toReveal.forEach(reveal);
    }, 1200);

    return () => {
      observer.disconnect();
      window.clearTimeout(failSafe);
    };
  }, []);

  return null;
}
