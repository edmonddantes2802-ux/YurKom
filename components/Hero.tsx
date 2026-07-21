import type { Landing } from '@/content/landings';
import Qualifier from '@/components/Qualifier';

// Разбито на число + подпись ради типографической подачи (крупный serif +
// моно-капс). Формулировки не изменены.
const TRUST_MARKERS = [
  { value: '18 лет', label: 'практики' },
  { value: '3 200+', label: 'выигранных дел' },
  { value: 'Москва', label: 'и МО' },
];

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

        <Qualifier slug={landing.slug} prompt={landing.qualifierPrompt} />
      </div>
    </section>
  );
}
