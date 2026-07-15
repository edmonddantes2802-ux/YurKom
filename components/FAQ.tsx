export default function FAQ({ faq }: { faq: { q: string; a: string }[] }) {
  if (faq.length === 0) return null;
  return (
    <section className="section">
      <div className="container">
        <div className="section-title">
          <span className="kicker">Вопросы и ответы</span>
          <h2>Частые вопросы</h2>
        </div>
        <div>
          {faq.map((item) => (
            <div className="faq-item" key={item.q}>
              <h3>{item.q}</h3>
              <p className="muted">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
