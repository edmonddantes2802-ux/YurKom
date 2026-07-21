import type { Case } from '@/content/landings';

// Шкала срока: общий горизонт для всех кейсов, чтобы сроки сравнивались
// между собой, а не каждый со своим масштабом.
const SCALE_DAYS = 30;

export default function Cases({ cases }: { cases: Case[] }) {
  if (cases.length === 0) return null;
  return (
    <section className="section">
      <div className="container">
        <div className="sec-head" data-reveal>
          <span className="kicker">Кейсы</span>
          <h2>Как это работает на практике</h2>
        </div>
        <div className="cases-grid">
          {cases.map((item, i) => {
            const hasScale = typeof item.days === 'number' && item.days > 0;
            const pos = hasScale
              ? `${Math.min((item.days as number) / SCALE_DAYS, 1) * 100}%`
              : undefined;

            return (
              <article
                className="case-card notched"
                key={item.problem}
                data-reveal
                data-reveal-delay={String(i + 1)}
              >
                <div className="case-row">
                  <div className="case-row-key">Проблема</div>
                  <p>{item.problem}</p>
                </div>
                <div className="case-row">
                  <div className="case-row-key">Действие</div>
                  <p>{item.action}</p>
                </div>

                <div className="case-result">
                  <strong className="case-result-headline">{item.result}</strong>

                  {hasScale && (
                    <div
                      className="case-scale"
                      style={{ '--scale-pos': pos } as React.CSSProperties}
                    >
                      <div className="case-scale-track">
                        <div className="case-scale-mark">
                          <span>{item.days} дней</span>
                        </div>
                      </div>
                      <div className="case-scale-legend">
                        <span>Обращение</span>
                        <span>{SCALE_DAYS} дней</span>
                      </div>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
