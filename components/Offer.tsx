import type { Landing } from '@/content/landings';
import SectionRail from '@/components/SectionRail';

export default function Offer({ offer }: { offer: Landing['offer'] }) {
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
          text="Опишите, что произошло. Разберём основания ареста и вернём план действий."
          ctaLabel="Получить оценку"
        />
      </div>
    </section>
  );
}
