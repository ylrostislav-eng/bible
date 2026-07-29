import clsx from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover active:scale-[0.98]',
  secondary: 'bg-surface-hover text-text-primary hover:bg-surface active:scale-[0.98]',
  ghost: 'bg-transparent text-text-secondary hover:text-text-primary',
};

export function Button({ variant = 'primary', className, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        'flex h-12 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        className,
      )}
      disabled={disabled}
      {...props}
    />
  );
}
