export default function Steps({ steps }: { steps: { title: string; desc: string }[] }) {
  if (steps.length === 0) return null;
  return (
    <section
      className="section"
      style={{ background: 'var(--color-bg-elevated)', borderBlock: '1px solid var(--color-border)' }}
    >
      <div className="container">
        <div className="sec-head" data-reveal>
          <span className="kicker">Порядок работы</span>
          <h2>Как мы действуем</h2>
        </div>
        <div
          className="steps-timeline"
          style={{ '--step-count': steps.length } as React.CSSProperties}
          data-reveal
          data-reveal-delay="1"
        >
          {steps.map((step, i) => (
            <div className="step-item" key={step.title}>
              <div className="step-marker">{String(i + 1).padStart(2, '0')}</div>
              <div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
