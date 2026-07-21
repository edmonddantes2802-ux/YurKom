import type { Landing } from '@/content/landings';
import { answeredFaq } from '@/lib/faq';

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

/** Возвращает null, если отвечать нечем — тогда схему FAQPage не добавляем. */
export function faqSchema(faq: Landing['faq']) {
  const answered = answeredFaq(faq);
  if (answered.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: answered.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}
