'use client';

import { useId, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import { reachGoal, collectUtm } from '@/lib/analytics';

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
        reachGoal('lead_created', { slug });
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
        <textarea
          ref={textareaRef}
          id={messageId}
          name="message"
          required
          minLength={10}
          maxLength={5000}
          placeholder={placeholder}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onFocus={handleFocus}
        />

        <label className="qualifier-label" htmlFor={phoneId}>
          Телефон
        </label>
        <input
          id={phoneId}
          name="phone"
          type="tel"
          maxLength={32}
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

        {status === 'error' && <p className="qualifier-status error">{errorText}</p>}
      </form>
    </div>
  );
}
