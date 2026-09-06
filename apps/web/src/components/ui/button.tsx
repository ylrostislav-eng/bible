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

/**
 * Выключенная кнопка гасится своим цветом, а не прозрачностью.
 *
 * Раньше здесь стоял `disabled:opacity-50`, и это работало ровно до тех
 * пор, пока под кнопкой был ровный фон приложения. С появлением обоев
 * (`ScreenBackground`) под ней оказалась картинка: на «Слове дня»
 * выключенная кнопка «Ответить» легла прямо на световой столб, и её
 * подпись стала почти нечитаемой. Прозрачность нельзя сделать
 * безопасной — она показывает то, чего мы не знаем заранее.
 *
 * `ghost` прозрачен по своей природе, ему гасится только текст.
 */
const DISABLED_CLASSES: Record<ButtonVariant, string> = {
  primary: 'disabled:bg-surface-hover disabled:text-text-muted disabled:hover:bg-surface-hover',
  secondary: 'disabled:bg-surface disabled:text-text-muted disabled:hover:bg-surface',
  ghost: 'disabled:text-text-muted disabled:hover:text-text-muted',
};

export function Button({ variant = 'primary', className, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        'flex h-12 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:active:scale-100',
        VARIANT_CLASSES[variant],
        DISABLED_CLASSES[variant],
        className,
      )}
      disabled={disabled}
      {...props}
    />
  );
}
