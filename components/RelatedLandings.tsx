import Link from 'next/link';
import type { Landing } from '@/content/landings';

/**
 * Перелинковка между смежными по смыслу посадочными (арест счёта ↔
 * субсидиарка и т.п.). Без этого блока посадочная — тупик: выйти можно
 * только на главную через лого в шапке.
 */
export default function RelatedLandings({ landings }: { landings: Landing[] }) {
  if (landings.length === 0) return null;
  return (
    <section className="section related">
      <div className="container">
        <div className="sec-head" data-reveal>
          <span className="kicker">Похожие ситуации</span>
          <h2>Могло случиться заодно с вашей</h2>
        </div>
        <div className="services-grid">
          {landings.map((landing, i) => (
            <Link
              key={landing.slug}
              href={`/${landing.slug}`}
              className="service-card"
              data-reveal
              data-reveal-delay={String(Math.min(i + 1, 5))}
            >
              <h3 className="service-title">{landing.h1}</h3>
              <span className="service-action">
                Подробно о направлении
                <span aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
