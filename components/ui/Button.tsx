import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost';
};

export default function Button({ variant = 'primary', className = '', ...props }: Props) {
  return <button className={`btn btn-${variant} ${className}`} {...props} />;
}
