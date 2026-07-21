'use client';

import { useState, useCallback, useId } from 'react';
import SectionRail from '@/components/SectionRail';
import { answeredFaq } from '@/lib/faq';

export default function FAQ({ faq: rawFaq }: { faq: { q: string; a: string }[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const baseId = useId();

  const toggle = useCallback((i: number) => {
    setOpenIndex((prev) => (prev === i ? null : i));
  }, []);

  // Вопросы-заготовки без ответа не показываем: раскрывающийся в пустоту
  // аккордеон хуже, чем отсутствие секции. Ответы появятся — секция вернётся.
  const faq = answeredFaq(rawFaq);
  if (faq.length === 0) return null;
  return (
    <section className="section">
      <div className="container">
        <div className="sec-head" data-reveal>
          <span className="kicker">Вопросы и ответы</span>
          <h2>Частые вопросы</h2>
        </div>
        <div className="split">
          <div className="faq-list">
          {faq.map((item, i) => {
            const isOpen = openIndex === i;
            const panelId = `${baseId}-faq-${i}`;
            return (
              <div
                className={`faq-item${isOpen ? ' open' : ''}`}
                key={item.q}
                data-reveal
                data-reveal-delay={String(Math.min(i + 1, 5))}
              >
                <button
                  className="faq-trigger"
                  onClick={() => toggle(i)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                >
                  <span>{item.q}</span>
                  <i className="faq-sign" aria-hidden="true" />
                </button>
                <div className="faq-answer" id={panelId} role="region">
                  <div className="faq-answer-inner">
                    <p>{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
          </div>

          <SectionRail
            num="05"
            title="Не нашли свой случай?"
            text="Ситуации редко совпадают дословно. Опишите свою — ответим по существу, а не шаблоном."
            ctaLabel="Описать ситуацию"
            showTelegram
          />
        </div>
      </div>
    </section>
  );
}
