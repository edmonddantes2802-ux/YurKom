'use client';

import { useState, useCallback } from 'react';

export default function FAQ({ faq }: { faq: { q: string; a: string }[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = useCallback((i: number) => {
    setOpenIndex((prev) => (prev === i ? null : i));
  }, []);

  if (faq.length === 0) return null;
  return (
    <section className="section">
      <div className="container">
        <div data-reveal>
          <span className="kicker">Вопросы и ответы</span>
          <h2>Частые вопросы</h2>
        </div>
        <div className="faq-list" style={{ marginTop: '2.5rem' }}>
          {faq.map((item, i) => (
            <div
              className={`faq-item${openIndex === i ? ' open' : ''}`}
              key={item.q}
              data-reveal
              data-reveal-delay={String(Math.min(i + 1, 5))}
            >
              <button
                className="faq-trigger"
                onClick={() => toggle(i)}
                aria-expanded={openIndex === i}
              >
                {item.q}
              </button>
              <div className="faq-answer" role="region">
                <div className="faq-answer-inner">{item.a}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
