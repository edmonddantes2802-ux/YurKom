import type { Landing } from '@/content/landings';

export default function Offer({ offer }: { offer: Landing['offer'] }) {
  return (
    <section className="section offer">
      <div className="container">
        <div className="section-title">
          <span className="kicker">Что вы получите</span>
          <h2>{offer.headline}</h2>
        </div>
        <ul className="offer-bullets">
          {offer.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
        <p className="offer-urgency">{offer.urgency}</p>
      </div>
    </section>
  );
}
