import type { Landing } from '@/content/landings';
import Qualifier from '@/components/Qualifier';

const TRUST_MARKERS = [
  '18 лет практики',
  '3 200+ выигранных дел',
  'Москва и МО',
];

export default function Hero({ landing }: { landing: Landing }) {
  return (
    <section className="hero">
      <div className="hero-inner">
        <h1 data-reveal>{landing.h1}</h1>
        <p className="hero-subtitle" data-reveal data-reveal-delay="1">
          {landing.subtitle}
        </p>
        <div className="hero-trust" data-reveal data-reveal-delay="1">
          {TRUST_MARKERS.map((marker, i) => (
            <span key={marker}>
              {i > 0 && <span className="sep" />}
              {marker}
            </span>
          ))}
        </div>
        <ul className="hero-pains" data-reveal data-reveal-delay="2">
          {landing.painPoints.map((pain) => (
            <li key={pain}>{pain}</li>
          ))}
        </ul>
        <Qualifier slug={landing.slug} prompt={landing.qualifierPrompt} />
      </div>
    </section>
  );
}
