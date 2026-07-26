'use client';

import { reachGoal } from '@/lib/analytics';
import { PHONE, PHONE_HREF, TELEGRAM_URL } from '@/lib/contacts';
import { COMPANY_NAME, COMPANY_TAGLINE } from '@/content/company';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-col">
            <div className="footer-brand">{COMPANY_NAME}</div>
            <p className="footer-tagline">{COMPANY_TAGLINE}</p>
          </div>

          <div className="footer-col">
            <a className="mono" href={PHONE_HREF} onClick={() => reachGoal('click_phone')}>
              {PHONE}
            </a>
            <a
              className="mono"
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => reachGoal('click_telegram')}
            >
              Telegram
            </a>
          </div>

          <div className="footer-col">
            <a href="#qualifier">Оценить ситуацию</a>
          </div>
        </div>

        <div className="footer-note">
          <span>&copy; {new Date().getFullYear()}</span>
          <span>Информация на сайте не является публичной офертой</span>
          <a
            className="footer-author"
            href="https://studiya-forma.ru/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Разработано в Студии FORMA
          </a>
        </div>
      </div>
    </footer>
  );
}
