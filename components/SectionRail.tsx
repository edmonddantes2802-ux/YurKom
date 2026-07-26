'use client';

import { reachGoal } from '@/lib/analytics';
import { PHONE, PHONE_HREF, TELEGRAM_URL } from '@/lib/contacts';

/**
 * Правый рельс секции. Занимает зону, которая иначе осталась бы голой справа
 * от узкой текстовой колонки: номер секции моно + вертикальная линия +
 * короткий якорь с действием. Липнет к верху при прокрутке длинной секции.
 */
export default function SectionRail({
  num,
  title,
  text,
  ctaLabel,
  showTelegram = false,
}: {
  num: string;
  title: string;
  text: string;
  ctaLabel: string;
  showTelegram?: boolean;
}) {
  return (
    <aside className="rail" data-reveal data-reveal-delay="2">
      <span className="rail-num" aria-hidden="true">
        {num}
      </span>
      <p className="rail-title">{title}</p>
      <p className="rail-text">{text}</p>
      <a href="#qualifier" className="rail-cta">
        {ctaLabel}
        <span aria-hidden="true">→</span>
      </a>
      <div className="rail-contacts">
        <a className="mono" href={PHONE_HREF} onClick={() => reachGoal('click_phone')}>
          {PHONE}
        </a>
        {showTelegram && (
          <a
            className="mono"
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => reachGoal('click_telegram')}
          >
            Telegram
          </a>
        )}
      </div>
    </aside>
  );
}
