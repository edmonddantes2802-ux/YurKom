import Card from '@/components/ui/Card';

export default function Steps({ steps }: { steps: { title: string; desc: string }[] }) {
  if (steps.length === 0) return null;
  return (
    <section className="section" style={{ background: 'var(--color-bg-elevated)' }}>
      <div className="container">
        <div className="section-title">
          <span className="kicker">Порядок работы</span>
          <h2>Как мы действуем</h2>
        </div>
        <div className="grid-3">
          {steps.map((step, i) => (
            <Card key={step.title}>
              <div className="step-num">{String(i + 1).padStart(2, '0')}</div>
              <h3>{step.title}</h3>
              <p className="muted" style={{ marginTop: '0.5rem' }}>
                {step.desc}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
