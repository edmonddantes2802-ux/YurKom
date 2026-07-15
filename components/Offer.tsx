import type { Landing } from '@/content/landings';

export default function Offer({ offer }: { offer: Landing['offer'] }) {
  return (
    <section className="section offer">
      <div className="container">
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
      </div>
    </section>
  );
}
