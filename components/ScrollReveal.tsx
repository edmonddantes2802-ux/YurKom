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

    els.forEach((el) => {
      // Элемент уже в вьюпорте или выше него (в т.ч. после восстановления
      // позиции прокрутки при перезагрузке) — показываем немедленно, иначе
      // observer выдаст isIntersecting=false и элемент застрянет невидимым.
      if (el.getBoundingClientRect().top < window.innerHeight) {
        reveal(el);
      } else {
        observer.observe(el);
      }
    });

    // Страховочная сеть: ничего не должно остаться невидимым навсегда.
    const failSafe = window.setTimeout(() => {
      els.forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight) reveal(el);
      });
    }, 1200);

    return () => {
      observer.disconnect();
      window.clearTimeout(failSafe);
    };
  }, []);

  return null;
}
