import type { Landing } from '@/content/landings';
import { answeredFaq } from '@/lib/faq';
import { COMPANY_NAME, COMPANY_TAGLINE } from '@/content/company';
import { PHONE_HREF } from '@/lib/contacts';
import { SITE_URL } from '@/lib/site';

/** Реальная география обслуживания (см. CLAUDE.md), а не вся РФ. */
const AREA_SERVED = 'Москва и Московская область';
const TELEPHONE = PHONE_HREF.replace(/^tel:/, '');

/**
 * Сериализация для <script type="application/ld+json">. Экранируем "<",
 * чтобы текст из конфига не мог закрыть тег и превратиться в разметку.
 */
export function serializeJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** Организация целиком — только на главной, чтобы не дублировать на посадочных. */
export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: COMPANY_NAME,
    description: COMPANY_TAGLINE,
    url: SITE_URL,
    telephone: TELEPHONE,
    areaServed: AREA_SERVED,
  };
}

/** Услуга компании в целом (не привязанная к боли конкретной посадочной). */
export function homeLegalServiceSchema(description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LegalService',
    name: COMPANY_NAME,
    description,
    url: SITE_URL,
    telephone: TELEPHONE,
    areaServed: AREA_SERVED,
  };
}

export function legalServiceSchema(landing: Landing) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LegalService',
    name: landing.h1,
    description: landing.metaDescription,
    url: `${SITE_URL}/${landing.slug}`,
    telephone: TELEPHONE,
    areaServed: AREA_SERVED,
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
