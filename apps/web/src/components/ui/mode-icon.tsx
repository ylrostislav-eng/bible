import clsx from 'clsx';

/**
 * Медальон режима: иконка в круге его цвета.
 *
 * Раньше у всех режимов в меню стоял один и тот же серый квадрат с
 * янтарной иконкой, и список читался как перечень одинаковых пунктов —
 * отличить дуэль от комнаты можно было только прочитав подпись.
 *
 * Цвет берётся из `lib/mode-theme.ts` и держится тихо: заливка в 12%,
 * кольцо в 35%. Сама иконка идёт полным цветом — она мелкая, и на
 * приглушённой заливке ей нужен контраст.
 */
export function ModeIcon({
  accent,
  children,
  className,
}: {
  accent: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', className)}
      style={{
        backgroundColor: `${accent}1f`,
        boxShadow: `inset 0 0 0 1px ${accent}59`,
        color: accent,
      }}
    >
      {children}
    </div>
  );
}
