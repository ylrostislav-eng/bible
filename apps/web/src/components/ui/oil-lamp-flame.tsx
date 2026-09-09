'use client';

import type { LampLook } from '@bible-arena/shared';
import { useId } from 'react';

interface OilLampFlameProps {
  /** Width in pixels; height follows the lamp's fixed aspect ratio. */
  size?: number;
  /** Soft ambient glow behind the flame — turn off for small inline badges. */
  glow?: boolean;
  className?: string;
  /**
   * Купленные в лавке детали лампы.
   *
   * Необязателен: без него рисуется та же лампа, что была до всякой
   * лавки. Незнакомая деталь тоже рисует обычную — каталог правится чаще,
   * чем выкатывается приложение, и старый экран не должен ломаться о
   * пламя, которого он не знает.
   */
  look?: LampLook | null;
}

/** Цвета пламени по ключу детали. Три остановки: низ, середина, верх —
 * ровно те же места, где стоят остановки у обычного огня. */
const FLAME_COLORS: Record<string, [string, string, string]> = {
  azure: ['#1f6fd6', '#4aa8f0', '#cfe9ff'],
  emerald: ['#1f8a4c', '#49c67c', '#d8f7e4'],
  violet: ['#6a2fb5', '#b56ae0', '#f2d9ff'],
  white: ['#9fb4d8', '#dbe6f7', '#ffffff'],
};

/** Внутренняя часть пламени — светлее внешней, иначе огонь плоский. */
const FLAME_INNER_COLORS: Record<string, [string, string]> = {
  azure: ['#7cc4ff', '#eaf6ff'],
  emerald: ['#7fe0a5', '#eafff2'],
  violet: ['#d79bf5', '#fbeeff'],
  white: ['#eef4ff', '#ffffff'],
};

/** Металл сосуда: верх и низ корпуса, и отдельно подставка. */
const VESSEL_COLORS: Record<string, { top: string; bottom: string; base: string }> = {
  clay: { top: '#c98b5e', bottom: '#7d4b2c', base: '#8a5433' },
  bronze: { top: '#b98a4a', bottom: '#5d4423', base: '#6d5029' },
  silver: { top: '#dfe6ee', bottom: '#8e9aa8', base: '#96a2b0' },
  gold: { top: '#ffd978', bottom: '#b8862b', base: '#c9932f' },
};

/** Цвет свечения по цвету пламени: ореол чужого цвета читается как
 * ошибка, а не как украшение. */
const GLOW_TINT: Record<string, string> = {
  azure: '#6bb8ff',
  emerald: '#63d698',
  violet: '#c88af0',
  white: '#eaf2ff',
};

/** Bible Arena's mascot: an oil lamp with an animated flame ("Да не угасает
 * светильник твой") — used on streak indicators and completion screens. */
export function OilLampFlame({ size = 96, glow = true, className, look }: OilLampFlameProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  // Незнакомый ключ падает на обычный вид: `?? ...` вместо проверки на
  // существование, чтобы новая деталь в каталоге не роняла старый экран.
  const flame = look?.flame ? FLAME_COLORS[look.flame] : undefined;
  const flameInner = look?.flame ? FLAME_INNER_COLORS[look.flame] : undefined;
  const vessel = look?.vessel ? VESSEL_COLORS[look.vessel] : undefined;
  const glowTint = (look?.flame && GLOW_TINT[look.flame]) || '#ffcf6b';
  const halo = look?.glow === 'halo' || look?.glow === 'rays' || look?.glow === 'stars';
  const rays = look?.glow === 'rays' || look?.glow === 'stars';
  const sparks = look?.glow === 'stars';

  return (
    <div className={className} style={{ width: size, aspectRatio: '100 / 130' }} aria-hidden="true">
      <svg viewBox="0 0 100 130" width="100%" height="100%" style={{ overflow: 'visible' }}>
        <defs>
          <radialGradient id={`glow-${uid}`} cx="50%" cy="42%" r="55%">
            <stop offset="0%" stopColor={glowTint} stopOpacity="0.55" />
            <stop offset="100%" stopColor={glowTint} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`lampBody-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={vessel?.top ?? '#e0b76e'} />
            <stop offset="100%" stopColor={vessel?.bottom ?? '#8a6a37'} />
          </linearGradient>
          <linearGradient id={`lampBase-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={vessel?.base ?? '#9a7940'} />
            <stop offset="100%" stopColor={vessel?.bottom ?? '#6b4f28'} />
          </linearGradient>
          <linearGradient id={`flameOuter-${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={flame?.[0] ?? '#e8551f'} />
            <stop offset="55%" stopColor={flame?.[1] ?? '#f6a531'} />
            <stop offset="100%" stopColor={flame?.[2] ?? '#ffe08a'} />
          </linearGradient>
          <linearGradient id={`flameInner-${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={flameInner?.[0] ?? '#ffb454'} />
            <stop offset="100%" stopColor={flameInner?.[1] ?? '#fff6d8'} />
          </linearGradient>
        </defs>

        {glow && (
          <circle className="flame-glow" cx="50" cy="50" r="42" fill={`url(#glow-${uid})`} />
        )}

        {/* Сияние рисуется под пламенем: поверх оно превращалось бы в
            пелену на самом ярком месте лампы. Каждая следующая покупка
            добавляет слой к предыдущей, а не заменяет её — иначе дорогие
            «Искры» выглядели бы беднее дешёвого «Ореола». */}
        {halo && (
          <circle
            cx="50"
            cy="48"
            r="34"
            fill="none"
            stroke={glowTint}
            strokeWidth="2"
            opacity="0.5"
          />
        )}
        {rays &&
          [0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
            <line
              key={angle}
              x1="50"
              y1="48"
              x2="50"
              y2="8"
              stroke={glowTint}
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.35"
              transform={`rotate(${angle} 50 48)`}
            />
          ))}
        {sparks &&
          [
            [30, 26],
            [70, 30],
            [38, 12],
            [64, 14],
            [50, 4],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="2.2" fill={glowTint} opacity="0.8" />
          ))}

        <g className="flame-outer" style={{ transformOrigin: '50px 72px' }}>
          <path
            d="M50 12
               C 62 28, 68 40, 68 52
               C 68 66, 58 74, 50 74
               C 42 74, 32 66, 32 52
               C 32 42, 37 35, 41 29
               C 40 38, 44 43, 48 43
               C 53 43, 55 38, 53 32
               C 50 24, 48 18, 50 12 Z"
            fill={`url(#flameOuter-${uid})`}
          />
        </g>
        <g className="flame-inner" style={{ transformOrigin: '50px 72px' }}>
          <path
            d="M50 34
               C 57 43, 60 50, 60 57
               C 60 65, 55 70, 50 70
               C 45 70, 40 65, 40 57
               C 40 52, 43 48, 45 44
               C 45 49, 47 52, 50 52
               C 53 52, 54 49, 52 45
               C 50 41, 49 37, 50 34 Z"
            fill={`url(#flameInner-${uid})`}
          />
        </g>

        <rect x="48.5" y="72" width="3" height="8" rx="1.4" fill="#3a2a18" />

        <path
          d="M20 80
             C 20 96 33 114 50 114
             C 67 114 80 96 80 80
             C 80 86 67 91 50 91
             C 33 91 20 86 20 80 Z"
          fill={`url(#lampBody-${uid})`}
        />
        <ellipse cx="50" cy="80" rx="30" ry="8" fill="#f2d9a3" opacity="0.35" />
        <ellipse
          cx="50"
          cy="80"
          rx="30"
          ry="8"
          fill="none"
          stroke="#6b4f28"
          strokeWidth="1"
          opacity="0.4"
        />

        <path d="M46 113 L54 113 L52 122 L48 122 Z" fill={`url(#lampBase-${uid})`} />
        <ellipse cx="50" cy="124" rx="17" ry="5" fill={`url(#lampBase-${uid})`} />
      </svg>
    </div>
  );
}
