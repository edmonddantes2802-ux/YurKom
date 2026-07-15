'use client';

import { reachGoal } from '@/lib/analytics';

const TELEGRAM_URL = 'https://t.me/placeholder';
const PHONE = '+7 (000) 000-00-00';
const PHONE_HREF = 'tel:+70000000000';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-inner">
          <div className="footer-links">
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => reachGoal('telegram_click')}
            >
              Telegram
            </a>
            <a href={PHONE_HREF} onClick={() => reachGoal('phone_click')}>
              {PHONE}
            </a>
          </div>
          <p>&copy; {new Date().getFullYear()} &middot; Юридическая антикризисная служба</p>
        </div>
      </div>
    </footer>
  );
}
