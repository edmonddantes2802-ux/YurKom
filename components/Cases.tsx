import type { Case } from '@/content/landings';

export default function Cases({ cases }: { cases: Case[] }) {
  if (cases.length === 0) return null;
  return (
    <section className="section">
      <div className="container">
        <div data-reveal>
          <span className="kicker">Кейсы</span>
          <h2>Как это работает на практике</h2>
        </div>
        <div className="cases-grid" style={{ marginTop: '2.5rem' }}>
          {cases.map((item, i) => (
            <article
              className="case-card"
              key={item.problem}
              data-reveal
              data-reveal-delay={String(i + 1)}
            >
              <div className="case-phase">
                <div className="case-phase-label">Проблема</div>
                <p>{item.problem}</p>
              </div>
              <div className="case-phase">
                <div className="case-phase-label">Действие</div>
                <p>{item.action}</p>
              </div>
              <div className="case-phase">
                <div className="case-phase-label">Результат</div>
                <p>{item.result}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
