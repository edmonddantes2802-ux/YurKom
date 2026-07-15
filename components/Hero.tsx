import type { Landing } from '@/content/landings';
import Qualifier from '@/components/Qualifier';

export default function Hero({ landing }: { landing: Landing }) {
  return (
    <section className="hero">
      <div className="container hero-grid">
        <div>
          <h1>{landing.h1}</h1>
          <p className="hero-subtitle">{landing.subtitle}</p>
          <ul className="hero-pains">
            {landing.painPoints.map((pain) => (
              <li key={pain}>{pain}</li>
            ))}
          </ul>
        </div>
        {/* Слот AI-квалификатора */}
        <Qualifier slug={landing.slug} prompt={landing.qualifierPrompt} />
      </div>
    </section>
  );
}
