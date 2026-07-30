import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { landings } from '@/content/landings';
import { legalServiceSchema, faqSchema, serializeJsonLd } from '@/lib/schema';
import { answeredFaq } from '@/lib/faq';
import { SITE_URL, OG_IMAGE } from '@/lib/site';
import ScrollReveal from '@/components/ScrollReveal';
import Header from '@/components/Header';
import Hero from '@/components/Hero';
import Offer from '@/components/Offer';
import Cases from '@/components/Cases';
import RepeatCTA from '@/components/RepeatCTA';
import Steps from '@/components/Steps';
import FAQ from '@/components/FAQ';
import RelatedLandings from '@/components/RelatedLandings';
import Footer from '@/components/Footer';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return Object.keys(landings).map((slug) => ({ slug }));
}

/**
 * НЕ СТАВИТЬ `false`. Кажется, что «только известные слаги» строже и дешевле,
 * но на standalone-сервере получается наоборот: неизвестный путь не матчится
 * вовсе, Next не находит для него преренденного варианта и на КАЖДЫЙ такой
 * запрос валит в лог `Error: Internal: NoFallbackError`. Боты дёргают
 * `/wp-admin`, `/.env` и подобное десятками в день — лог забивается мусором,
 * за которым не видно настоящих ошибок.
 *
 * С `true` неизвестный слаг рендерится по запросу и `notFound()` ниже отдаёт
 * `app/[slug]/not-found.tsx` со статусом 404 — без внутренней ошибки. Шесть
 * реальных посадочных как были статикой из `generateStaticParams`, так и
 * остались; рендер на лету достаётся только несуществующим адресам.
 */
export const dynamicParams = true;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const landing = landings[slug];
  if (!landing) return {};
  return {
    title: landing.metaTitle,
    description: landing.metaDescription,
    alternates: {
      canonical: `${SITE_URL}/${landing.slug}`,
    },
    openGraph: {
      title: landing.metaTitle,
      description: landing.metaDescription,
      siteName: 'Митрагост',
      url: `${SITE_URL}/${landing.slug}`,
      locale: 'ru_RU',
      type: 'website',
      images: [OG_IMAGE],
    },
  };
}

export default async function LandingPage({ params }: Props) {
  const { slug } = await params;
  const landing = landings[slug];
  if (!landing) notFound();

  const jsonLd = [legalServiceSchema(landing), faqSchema(landing.faq)].filter(Boolean);
  const hasFaq = answeredFaq(landing.faq).length > 0;
  const relatedLandings = (landing.related ?? [])
    .map((slug) => landings[slug])
    .filter((l): l is NonNullable<typeof l> => Boolean(l));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <ScrollReveal />
      <Header />
      <main>
        <Hero landing={landing} />
        <Offer offer={landing.offer} railText={landing.offerRailText} />
        <Cases cases={landing.cases} />
        {/* Полоса между Cases и Steps имеет смысл только когда кейсы есть —
            иначе она повисает сразу после Offer без контекста. */}
        {landing.cases.length > 0 && <RepeatCTA />}
        <Steps steps={landing.steps} />
        {/* Обычно последний призыв перед футером даёт рельс FAQ. Если отвечать
            нечем и секция не рендерится, призыв возвращает CTA-полоса. */}
        {hasFaq ? <FAQ faq={landing.faq} /> : <RepeatCTA />}
        <RelatedLandings landings={relatedLandings} />
      </main>
      <Footer />
    </>
  );
}
