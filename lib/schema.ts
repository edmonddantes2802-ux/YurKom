import type { Landing } from '@/content/landings';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://example.com';

export function legalServiceSchema(landing: Landing) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LegalService',
    name: landing.h1,
    description: landing.metaDescription,
    url: `${SITE_URL}/${landing.slug}`,
    areaServed: 'RU',
  };
}

export function faqSchema(faq: Landing['faq']) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}
