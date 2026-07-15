import type { ButtonHTMLAttributes, CSSProperties } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost';
};

const base: CSSProperties = {
  display: 'inline-block',
  fontFamily: 'var(--font-sans)',
  fontSize: '1rem',
  fontWeight: 600,
  padding: '0.9rem 2rem',
  borderRadius: '8px',
  cursor: 'pointer',
  transition: 'background 0.2s, color 0.2s, border-color 0.2s',
};

const variants: Record<'primary' | 'ghost', CSSProperties> = {
  primary: {
    background: 'var(--color-accent)',
    color: 'var(--color-accent-contrast)',
    border: '1px solid var(--color-accent)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
  },
};

export default function Button({ variant = 'primary', style, ...props }: Props) {
  return <button style={{ ...base, ...variants[variant], ...style }} {...props} />;
}
