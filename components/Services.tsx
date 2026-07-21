import Link from 'next/link';
import { services } from '@/content/services';

/**
 * Направления работы. Карточка называет не услугу, а то, что под ударом —
 * человек в кризисе ищет свою ситуацию, а не название практики.
 * Направления без посадочной ведут на форму, а не в тупик «скоро».
 */
export default function Services() {
  return (
    <section className="section services" id="napravleniya">
      <div className="container">
        <div className="sec-head" data-reveal>
          <span className="kicker">Направления</span>
          <h2>С чем к нам приходят</h2>
          <p>
            Если вашей ситуации в списке нет — опишите её в форме. Разберём и скажем, беремся ли.
          </p>
        </div>

        <div className="services-grid">
          {services.map((service, i) => {
            const href = service.href ?? '#qualifier';
            return (
              <Link
                key={service.key}
                href={href}
                className="service-card"
                data-reveal
                data-reveal-delay={String(Math.min(i + 1, 5))}
              >
                <span className="service-tag">{service.tag}</span>
                <h3 className="service-title">{service.title}</h3>
                <p className="service-desc">{service.desc}</p>
                <span className="service-action">
                  {service.href ? 'Подробно о направлении' : 'Описать ситуацию'}
                  <span aria-hidden="true">→</span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
