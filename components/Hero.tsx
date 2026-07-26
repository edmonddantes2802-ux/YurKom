import type { Landing } from '@/content/landings';
import Qualifier from '@/components/Qualifier';
// Один источник маркеров на главную и посадочные: раздвоение как раз и привело
// к тому, что неподтверждённые цифры лежали в двух местах.
import { TRUST_MARKERS } from '@/content/company';

export default function Hero({ landing }: { landing: Landing }) {
  return (
    <section className="hero">
      <div className="container hero-grid">
        <div data-reveal>
          <h1>{landing.h1}</h1>
          <p className="hero-subtitle">{landing.subtitle}</p>
          <ul className="hero-pains">
            {landing.painPoints.map((pain) => (
              <li key={pain}>{pain}</li>
            ))}
          </ul>
          <div className="hero-trust">
            {TRUST_MARKERS.map((marker) => (
              <div className="hero-trust-item" key={marker.value}>
                <span className="hero-trust-value">{marker.value}</span>
                <span className="hero-trust-label">{marker.label}</span>
              </div>
            ))}
          </div>
        </div>

        <Qualifier
          slug={landing.slug}
          prompt={landing.qualifierPrompt}
          chips={landing.qualifierChips}
          placeholder={landing.qualifierPlaceholder}
          note={landing.qualifierNote}
        />
      </div>
    </section>
  );
}
