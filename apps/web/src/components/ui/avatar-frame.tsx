'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';

/**
 * Кольцо вокруг значка игрока — то, что покупается в лавке.
 *
 * Рисуется кодом, а не картинками: рамка появляется в списках по десятку
 * штук на экран, и десяток загруженных файлов ради колец — это трафик и
 * мигание там, где нужен ровный список. Заодно кольцо само подстраивается
 * под любой размер значка.
 *
 * Ключи те же, что `value` у товаров вида FRAME в каталоге. Неизвестный
 * ключ рисует пустоту, а не падает: каталог правится чаще, чем выкатывается
 * приложение, и старый клиент не должен ломаться о новую рамку.
 */
export function AvatarFrame({
  frame,
  size,
  children,
  className,
}: {
  frame: string | null | undefined;
  /** Сторона значка в пикселях — кольцо рисуется чуть шире. */
  size: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx('relative inline-flex shrink-0', className)}
      style={{ width: size, height: size }}
    >
      {children}
      {frame ? <FrameRing frame={frame} /> : null}
    </span>
  );
}

function FrameRing({ frame }: { frame: string }) {
  // Кольцо лежит поверх значка и не перехватывает нажатия: под ним живая
  // карточка игрока, и рамка не должна становиться крышкой над ней.
  const common = 'pointer-events-none absolute -inset-[3px]';

  if (frame === 'flame') {
    return (
      <svg viewBox="0 0 100 100" className={common} aria-hidden>
        <defs>
          <linearGradient id="af-flame" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffd27a" />
            <stop offset="100%" stopColor="#e07b39" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="47" fill="none" stroke="url(#af-flame)" strokeWidth="5" />
      </svg>
    );
  }

  if (frame === 'laurel') {
    // Венок: две дуги с листьями по краям, а не замкнутое кольцо — так
    // читается как венок, а не как вторая обводка.
    return (
      <svg viewBox="0 0 100 100" className={common} aria-hidden>
        <g fill="none" stroke="#9bc46a" strokeWidth="4" strokeLinecap="round">
          <path d="M14 26a46 46 0 0 0 0 48" />
          <path d="M86 26a46 46 0 0 1 0 48" />
        </g>
        <g fill="#9bc46a" opacity="0.85">
          {[30, 45, 60, 70].map((y, i) => (
            <ellipse key={`l${i}`} cx="12" cy={y} rx="6" ry="3.4" />
          ))}
          {[30, 45, 60, 70].map((y, i) => (
            <ellipse key={`r${i}`} cx="88" cy={y} rx="6" ry="3.4" />
          ))}
        </g>
      </svg>
    );
  }

  if (frame === 'scroll') {
    return (
      <svg viewBox="0 0 100 100" className={common} aria-hidden>
        <circle
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="#d9c9a3"
          strokeWidth="4"
          strokeDasharray="10 5"
        />
        {/* Валики свитка сверху и снизу — от них силуэт и читается. */}
        <rect x="34" y="-2" width="32" height="7" rx="3.5" fill="#c2a878" />
        <rect x="34" y="95" width="32" height="7" rx="3.5" fill="#c2a878" />
      </svg>
    );
  }

  if (frame === 'dawn') {
    return (
      <svg viewBox="0 0 100 100" className={common} aria-hidden>
        <defs>
          <linearGradient id="af-dawn" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#7a5cd6" />
            <stop offset="45%" stopColor="#e0678f" />
            <stop offset="100%" stopColor="#ffcf7a" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="47" fill="none" stroke="url(#af-dawn)" strokeWidth="6" />
        <circle cx="50" cy="50" r="47" fill="none" stroke="#fff" strokeWidth="1" opacity="0.35" />
      </svg>
    );
  }

  return null;
}
