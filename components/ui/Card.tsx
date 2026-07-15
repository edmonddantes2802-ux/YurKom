import type { HTMLAttributes } from 'react';

export default function Card({ style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        padding: '2rem',
        ...style,
      }}
      {...props}
    />
  );
}
