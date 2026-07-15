import type { Landing } from '@/content/landings';
import Qualifier from '@/components/Qualifier';

export default function Hero({ landing }: { landing: Landing }) {
  return (
    <section className="hero">
      <div className="hero-inner">
        <h1 data-reveal>{landing.h1}</h1>
        <p className="hero-subtitle" data-reveal data-reveal-delay="1">
          {landing.subtitle}
        </p>
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
