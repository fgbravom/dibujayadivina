import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'sol' | 'secondary' | 'ghost';
type Size = 'md' | 'lg' | 'icon';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

const VARIANTS: Record<Variant, string> = {
  primary:
    'border-ink bg-copihue text-white shadow-pop hover:bg-copihue-dark active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
  sol: 'border-ink bg-sol text-ink shadow-pop hover:brightness-95 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
  secondary:
    'border-ink bg-card text-ink shadow-pop hover:bg-sol-soft active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
  ghost:
    'border-transparent bg-transparent text-ink underline underline-offset-4 hover:bg-paper-deep',
};

const SIZES: Record<Size, string> = {
  md: 'min-h-11 px-4 text-base',
  lg: 'min-h-12 px-6 text-lg',
  icon: 'size-11 p-0',
};

const DISABLED =
  'disabled:border-ink-soft disabled:bg-paper-deep disabled:text-ink-soft disabled:shadow-none';

/** Botón con objetivo táctil mínimo de 44 px. En botones de solo ícono, pasa siempre `aria-label`. */
export function Button({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex select-none items-center justify-center gap-2 rounded-xl border-2 font-extrabold transition-[transform,box-shadow,background-color] ${VARIANTS[variant]} ${SIZES[size]} ${DISABLED} ${className}`}
      {...props}
    />
  );
}
