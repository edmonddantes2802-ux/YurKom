'use client';

import { reachGoal } from '@/lib/analytics';

const TELEGRAM_URL = 'https://t.me/placeholder';
const PHONE = '+7 (000) 000-00-00';
const PHONE_HREF = 'tel:+70000000000';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-col">
            <div className="footer-brand">Юридическая антикризисная служба</div>
          </div>

          <div className="footer-col">
            <a className="mono" href={PHONE_HREF} onClick={() => reachGoal('phone_click')}>
              {PHONE}
            </a>
            <a
              className="mono"
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => reachGoal('telegram_click')}
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
        </div>
      </div>
    </footer>
  );
}
