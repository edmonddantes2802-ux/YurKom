import type { Metadata } from 'next';
import { organizationSchema, homeLegalServiceSchema, serializeJsonLd } from '@/lib/schema';
import { SITE_URL } from '@/lib/site';
import ScrollReveal from '@/components/ScrollReveal';
import Header from '@/components/Header';
import HomeHero from '@/components/HomeHero';
import Services from '@/components/Services';
import WhyUs from '@/components/WhyUs';
import RepeatCTA from '@/components/RepeatCTA';
import Footer from '@/components/Footer';

const META_DESCRIPTION =
  'Антикризисная юридическая защита бизнеса в Москве и МО: арест счетов, субсидиарная ответственность, налоговые споры, защита личных активов. Бесплатная оценка ситуации.';

export const metadata: Metadata = {
  title: 'Митрагост — антикризисная юридическая защита бизнеса',
  description: META_DESCRIPTION,
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: 'Митрагост — антикризисная юридическая защита бизнеса',
    description: META_DESCRIPTION,
    locale: 'ru_RU',
    type: 'website',
  },
};

export default function Home() {
  const jsonLd = [organizationSchema(), homeLegalServiceSchema(META_DESCRIPTION)];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <ScrollReveal />
      <Header />
      <main>
        <HomeHero />
        <Services />
        <WhyUs />
        <RepeatCTA />
      </main>
      <Footer />
    </>
  );
}
