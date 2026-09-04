import Link from 'next/link';

/**
 * Стрелка «назад» в шапке экрана.
 *
 * Отдельным компонентом, а не разметкой на месте, по скучной причине:
 * когда её пишут вручную, на каком-то экране её однажды забывают. Так и
 * вышло со «Словом дня» и «Горячо-холодно» — оба открываются с главной,
 * и оба оказались без выхода: в приложении, добавленном на домашний
 * экран, системной кнопки «назад» нет, и человек упирался в тупик.
 *
 * Ведёт по прямому адресу, а не `history.back()`: экран можно открыть по
 * ссылке от друга, и тогда «назад» увело бы из приложения совсем.
 */
export function BackLink({
  href,
  label,
}: {
  href: string;
  /** Куда именно ведёт — читается озвучкой вместо голого «назад». */
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-text-secondary transition hover:bg-surface-hover hover:text-text-primary"
    >
      ←
    </Link>
  );
}
