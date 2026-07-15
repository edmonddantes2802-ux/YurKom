'use client';

import { useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import { reachGoal, collectUtm } from '@/lib/analytics';

type Status = 'idle' | 'sending' | 'success' | 'error';

const HINT_CHIPS = [
  { label: 'Налоговая заблокировала', prefix: 'Налоговая заблокировала счёт: ' },
  { label: 'Приставы / ФССП', prefix: 'Судебные приставы арестовали: ' },
  { label: 'Банк 115-ФЗ', prefix: 'Банк заблокировал по 115-ФЗ: ' },
];

export default function Qualifier({ slug, prompt }: { slug: string; prompt: string }) {
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorText, setErrorText] = useState('');
  const startedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
          message,
          phone,
          slug,
          utm: collectUtm(),
          website: honeypot,
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
        <div className="qualifier qualifier-success">
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
      <form className="qualifier" onSubmit={handleSubmit}>
        <h3>Опишите ситуацию</h3>
        <p className="qualifier-hint">{prompt}</p>
        <div className="qualifier-chips">
          {HINT_CHIPS.map((chip) => (
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
        <textarea
          ref={textareaRef}
          name="message"
          required
          minLength={10}
          maxLength={5000}
          placeholder="Например: вчера банк заблокировал расчётный счёт…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onFocus={handleFocus}
        />
        <input
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
        <span className="urgency-badge">
          Реагируем в течение 30 минут — при аресте каждый день на счету
        </span>
        <Button type="submit" disabled={status === 'sending'} style={{ width: '100%' }}>
          {status === 'sending' ? 'Отправляем…' : 'Получить оценку ситуации'}
        </Button>
        {status === 'error' && <p className="qualifier-status error">{errorText}</p>}
      </form>
    </div>
  );
}
