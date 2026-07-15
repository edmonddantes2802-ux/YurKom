import type { Case } from '@/content/landings';
import Card from '@/components/ui/Card';

export default function Cases({ cases }: { cases: Case[] }) {
  if (cases.length === 0) return null;
  return (
    <section className="section">
      <div className="container">
        <div className="section-title">
          <span className="kicker">Кейсы</span>
          <h2>Как это работает на практике</h2>
        </div>
        <div className="grid-2">
          {cases.map((item) => (
            <Card key={item.problem}>
              <div className="case-block">
                <div className="case-label">Проблема</div>
                <p>{item.problem}</p>
              </div>
              <div className="case-block">
                <div className="case-label">Действие</div>
                <p>{item.action}</p>
              </div>
              <div className="case-block">
                <div className="case-label">Результат</div>
                <p>{item.result}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
