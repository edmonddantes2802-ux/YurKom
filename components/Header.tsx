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
          {/* На узких экранах номер сворачивается в иконку трубки, но остаётся
              кликабельным: звонок — основной канал для горячего кризиса. */}
          <a
            href={PHONE_HREF}
            className="header-phone"
            aria-label={`Позвонить ${PHONE}`}
            onClick={() => reachGoal('phone_click')}
          >
            <svg
              className="header-phone-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3z" />
            </svg>
            <span className="header-phone-num">{PHONE}</span>
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
