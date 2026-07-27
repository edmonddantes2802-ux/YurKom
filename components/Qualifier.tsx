'use client';

import { useId, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import DraftText from '@/components/ui/DraftText';
import { reachGoal, collectUtm } from '@/lib/analytics';
import { SITUATION_MIN, SITUATION_MAX, PHONE_INPUT_MAX } from '@/lib/limits';
import {
  PRIVACY_CONSENT_NOTICE,
  PRIVACY_LINK_LABEL,
  SITUATION_CAUTION_NOTICE,
} from '@/content/privacy-notice';

type Status = 'idle' | 'sending' | 'success' | 'error';

// Нейтральные значения на случай, если посадочная их не переопределила.
const DEFAULT_PLACEHOLDER = 'Например: что произошло, когда, какие суммы затронуты…';
const DEFAULT_NOTE = 'Реагируем в течение 30 минут';

export default function Qualifier({
  slug,
  prompt,
  chips,
  placeholder = DEFAULT_PLACEHOLDER,
  note = DEFAULT_NOTE,
}: {
  slug: string;
  prompt: string;
  chips?: { label: string; prefix: string }[];
  placeholder?: string;
  note?: string;
}) {
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorText, setErrorText] = useState('');
  const startedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const baseId = useId();

  const chipsLabelId = `${baseId}-chips`;
  const messageId = `${baseId}-message`;
  const cautionId = `${baseId}-caution`;
  const phoneId = `${baseId}-phone`;

  function handleFocus() {
    if (!startedRef.current) {
      startedRef.current = true;
      reachGoal('qualifier_started');
    }
  }

  function handleChipClick(prefix: string) {
    if (!message) {
      setMessage(prefix);
    }
    handleFocus();
    textareaRef.current?.focus();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'sending') return;

    const form = e.currentTarget;
    const honeypot = (form.elements.namedItem('website') as HTMLInputElement | null)?.value ?? '';

    setStatus('sending');
    setErrorText('');
    reachGoal('qualifier_submitted');

    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          situation: message,
          phone,
          // Источник заявки — слаг посадочной, на главной это 'homepage'.
          source: slug,
          utm: collectUtm(),
          honeypot,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setStatus('success');
        reachGoal('lead_form', { slug });
      } else {
        setStatus('error');
        setErrorText(data.error || 'Не удалось отправить. Попробуйте ещё раз.');
      }
    } catch {
      setStatus('error');
      setErrorText('Ошибка сети. Попробуйте ещё раз.');
    }
  }

  if (status === 'success') {
    return (
      <div className="qualifier-wrap" id="qualifier" data-reveal data-reveal-delay="3">
        <div className="qualifier notched qualifier-success">
          <h3>Заявка отправлена</h3>
          <p className="qualifier-status success">
            Мы изучим вашу ситуацию и свяжемся с вами в ближайшее время.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="qualifier-wrap" id="qualifier" data-reveal data-reveal-delay="3">
      <form className="qualifier notched" onSubmit={handleSubmit}>
        <h3>Опишите ситуацию</h3>
        <p className="qualifier-hint">{prompt}</p>

        {/* Чипы — подсказка под конкретную боль. Не заданы в конфиге —
            блок не рендерим, пустую группу кнопок не показываем. */}
        {chips && chips.length > 0 && (
          <>
            <span className="qualifier-label" id={chipsLabelId}>
              С чего начать
            </span>
            <div className="qualifier-chips" role="group" aria-labelledby={chipsLabelId}>
              {chips.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  className="qualifier-chip"
                  onClick={() => handleChipClick(chip.prefix)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </>
        )}

        <label className="qualifier-label" htmlFor={messageId}>
          Ситуация
        </label>
        {/* Предупреждение стоит ДО поля, а не под ним: после того как человек
            уже всё написал, читать его поздно. Формулировку утверждает
            адвокат — пока плейсхолдер. */}
        <p className="qualifier-field-hint" id={cautionId}>
          <DraftText text={SITUATION_CAUTION_NOTICE} />
        </p>
        {/* ym-disable-keys — Вебвизор Метрики не пишет то, что здесь набирают.
            В поле попадают персональные данные и обстоятельства дела. */}
        <textarea
          className="ym-disable-keys"
          ref={textareaRef}
          id={messageId}
          aria-describedby={cautionId}
          name="message"
          required
          minLength={SITUATION_MIN}
          maxLength={SITUATION_MAX}
          placeholder={placeholder}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onFocus={handleFocus}
        />

        <label className="qualifier-label" htmlFor={phoneId}>
          Телефон
        </label>
        <input
          className="ym-disable-keys"
          id={phoneId}
          name="phone"
          type="tel"
          maxLength={PHONE_INPUT_MAX}
          placeholder="Телефон для связи (необязательно)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onFocus={handleFocus}
        />

        <div className="hp-field" aria-hidden="true">
          <label>
            Website
            <input name="website" type="text" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <div className="qualifier-actions">
          <span className="urgency-badge">{note}</span>
          <Button type="submit" disabled={status === 'sending'} style={{ width: '100%' }}>
            {status === 'sending' ? 'Отправляем…' : 'Получить оценку ситуации'}
          </Button>
        </div>

        {/* Формулировку согласия утверждает юрист — она стоит плейсхолдером.
            Ссылка на политику рабочая уже сейчас: человек должен иметь
            возможность прочитать документ до того, как отправит данные. */}
        <p className="qualifier-consent">
          <DraftText text={PRIVACY_CONSENT_NOTICE} />{' '}
          <a href="/privacy">{PRIVACY_LINK_LABEL}</a>
        </p>

        {status === 'error' && <p className="qualifier-status error">{errorText}</p>}
      </form>
    </div>
  );
}
