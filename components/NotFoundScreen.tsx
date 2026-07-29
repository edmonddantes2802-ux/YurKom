import Link from 'next/link';
import ScrollReveal from '@/components/ScrollReveal';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { servicesWithPage } from '@/content/services';

/**
 * Экран 404 в стиле сайта. Общий для корневого `app/not-found.tsx` и для
 * `app/[slug]/not-found.tsx` — иначе два одинаковых экрана разъедутся при
 * первой же правке.
 *
 * Человек попадает сюда по битой ссылке из выдачи, из старой рекламы или из
 * пересланного сообщения. Он пришёл с конкретной болью, поэтому страница не
 * заканчивается извинением: ниже лежат все шесть направлений, и из тупика есть
 * ровно тот же выбор, что и на главной.
 *
 * Список направлений берётся из `content/services.ts` (`servicesWithPage`) —
 * добавили посадочную, она сама появилась и здесь.
 */
export default function NotFoundScreen() {
  return (
    <>
      <ScrollReveal />
      <Header />
      <main>
        <section className="section">
          <div className="container">
            <div className="sec-head" data-reveal>
              <span className="kicker">Ошибка 404</span>
              <h1>Такой страницы нет</h1>
              <p>
                Адрес не существует или ссылка устарела. Если вы искали конкретную ситуацию — она,
                скорее всего, ниже.
              </p>
            </div>

            <div className="services-grid">
              {servicesWithPage.map((service, i) => (
                <Link
                  key={service.key}
                  href={service.href as string}
                  className="service-card"
                  data-reveal
                  data-reveal-delay={String(Math.min(i + 1, 5))}
                >
                  <span className="service-tag">{service.tag}</span>
                  <h3 className="service-title">{service.title}</h3>
                  <p className="service-desc">{service.desc}</p>
                  <span className="service-action">
                    Подробно о направлении
                    <span aria-hidden="true">→</span>
                  </span>
                </Link>
              ))}
            </div>

            <p style={{ marginTop: 'clamp(2rem, 4vw, 3rem)' }} data-reveal>
              <Link href="/" className="btn btn-ghost">
                На главную
              </Link>
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
