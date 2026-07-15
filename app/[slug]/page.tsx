import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { landings } from '@/content/landings';
import { legalServiceSchema, faqSchema } from '@/lib/schema';
import Hero from '@/components/Hero';
import Offer from '@/components/Offer';
import Cases from '@/components/Cases';
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

  const jsonLd = [legalServiceSchema(landing), faqSchema(landing.faq)];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main>
        <Hero landing={landing} />
        <Offer offer={landing.offer} />
        <Cases cases={landing.cases} />
        <Steps steps={landing.steps} />
        <FAQ faq={landing.faq} />
      </main>
      <Footer />
    </>
  );
}
