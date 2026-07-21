import type { Landing } from '@/content/landings';
import SectionRail from '@/components/SectionRail';

const DEFAULT_RAIL_TEXT = 'Опишите, что произошло. Разберём ситуацию и вернём план действий.';

export default function Offer({ offer, railText }: { offer: Landing['offer']; railText?: string }) {
  return (
    <section className="section offer">
      <div className="container split">
        <div className="offer-inner" data-reveal>
          <span className="kicker">Что вы получите</span>
          <h2>{offer.headline}</h2>
          <ul className="offer-bullets">
            {offer.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
          <p className="offer-urgency">{offer.urgency}</p>
        </div>

        <SectionRail
          num="02"
          title="Оценка ситуации — бесплатно"
          text={railText ?? DEFAULT_RAIL_TEXT}
          ctaLabel="Получить оценку"
        />
      </div>
    </section>
  );
}
