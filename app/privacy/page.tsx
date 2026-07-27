import type { Metadata } from 'next';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import DraftText, { hasPlaceholder } from '@/components/ui/DraftText';
import { SITE_URL } from '@/lib/site';
import { COMPANY_NAME } from '@/content/company';
import {
  PRIVACY_SECTIONS,
  PRIVACY_EFFECTIVE_DATE,
  PRIVACY_DRAFT_NOTICE,
} from '@/content/privacy';

const TITLE = 'Политика обработки персональных данных';

/**
 * Документ ещё не заполнен (см. `content/privacy.ts`), поэтому страница
 * закрыта от индексации и не попадает в `sitemap.ts`. Ссылки из формы и
 * футера при этом работают: человек, который хочет прочитать политику до
 * отправки данных, должен её открыть, а не упереться в 404.
 *
 * Как только юрист заменит плейсхолдеры — снять `robots`, убрать плашку
 * `PRIVACY_DRAFT_NOTICE` и добавить `/privacy` в `app/sitemap.ts`.
 */
const isDraft = PRIVACY_SECTIONS.some(
  (s) => [...s.body, ...(s.list ?? [])].some(hasPlaceholder) || hasPlaceholder(s.title),
);

export const metadata: Metadata = {
  title: `${TITLE} — ${COMPANY_NAME}`,
  description: `Как ${COMPANY_NAME} обрабатывает персональные данные посетителей сайта и пользователей бота.`,
  alternates: { canonical: `${SITE_URL}/privacy` },
  robots: isDraft ? { index: false, follow: false } : undefined,
};

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="container section legal">
        <span className="kicker">Правовая информация</span>
        <h1>{TITLE}</h1>

        <p className="legal-meta mono">
          Редакция от <DraftText text={PRIVACY_EFFECTIVE_DATE} />
        </p>

        {isDraft && (
          <p className="legal-draft-notice" role="note">
            {PRIVACY_DRAFT_NOTICE}
          </p>
        )}

        <ol className="legal-toc">
          {PRIVACY_SECTIONS.map((section, i) => (
            <li key={section.title}>
              <a href={`#section-${i + 1}`}>{section.title}</a>
            </li>
          ))}
        </ol>

        {PRIVACY_SECTIONS.map((section, i) => (
          <section key={section.title} className="legal-section" id={`section-${i + 1}`}>
            <h2>
              <span className="legal-num mono">{i + 1}.</span> {section.title}
            </h2>
            {section.body.map((paragraph, j) => (
              <p key={j}>
                <DraftText text={paragraph} />
              </p>
            ))}
            {section.list && (
              <ul className="legal-list">
                {section.list.map((item, j) => (
                  <li key={j}>
                    <DraftText text={item} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <p className="legal-back">
          <Link href="/">← На главную</Link>
        </p>
      </main>
      <Footer />
    </>
  );
}
