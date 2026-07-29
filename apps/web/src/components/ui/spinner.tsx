import clsx from 'clsx';

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        'h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary',
        className,
      )}
      role="status"
      aria-label="Загрузка"
    />
  );
}
