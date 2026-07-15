'use client';

import { reachGoal } from '@/lib/analytics';

const PHONE = '+7 (000) 000-00-00';
const PHONE_HREF = 'tel:+70000000000';
const TELEGRAM_URL = 'https://t.me/placeholder';

export default function Header() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <a href="/" className="header-logo">
          Юридическая антикризисная служба
        </a>
        <div className="header-actions">
          <a
            href={PHONE_HREF}
            className="header-phone"
            onClick={() => reachGoal('phone_click')}
          >
            {PHONE}
          </a>
          <a
            href={TELEGRAM_URL}
            className="header-tg"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => reachGoal('telegram_click')}
          >
            Telegram
          </a>
        </div>
      </div>
    </header>
  );
}
