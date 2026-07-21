import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { landings } from '@/content/landings';
import { legalServiceSchema, faqSchema, serializeJsonLd } from '@/lib/schema';
import { answeredFaq } from '@/lib/faq';
import ScrollReveal from '@/components/ScrollReveal';
import Header from '@/components/Header';
import Hero from '@/components/Hero';
import Offer from '@/components/Offer';
import Cases from '@/components/Cases';
import RepeatCTA from '@/components/RepeatCTA';
import Steps from '@/components/Steps';
import FAQ from '@/components/FAQ';
import Footer from '@/components/Footer';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return Object.keys(landings).map((slug) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const landing = landings[slug];
  if (!landing) return {};
  return {
    title: landing.metaTitle,
    description: landing.metaDescription,
    alternates: {
      canonical: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://example.com'}/${landing.slug}`,
    },
    openGraph: {
      title: landing.metaTitle,
      description: landing.metaDescription,
      locale: 'ru_RU',
      type: 'website',
    },
  };
}

export default async function LandingPage({ params }: Props) {
  const { slug } = await params;
  const landing = landings[slug];
  if (!landing) notFound();

  const jsonLd = [legalServiceSchema(landing), faqSchema(landing.faq)].filter(Boolean);
  const hasFaq = answeredFaq(landing.faq).length > 0;

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
      </main>
      <Footer />
    </>
  );
}
