'use client';

import { useId } from 'react';

interface OilLampFlameProps {
  /** Width in pixels; height follows the lamp's fixed aspect ratio. */
  size?: number;
  /** Soft ambient glow behind the flame — turn off for small inline badges. */
  glow?: boolean;
  className?: string;
}

/** Bible Arena's mascot: an oil lamp with an animated flame ("Да не угасает
 * светильник твой") — used on streak indicators and completion screens. */
export function OilLampFlame({ size = 96, glow = true, className }: OilLampFlameProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  return (
    <div className={className} style={{ width: size, aspectRatio: '100 / 130' }} aria-hidden="true">
      <svg viewBox="0 0 100 130" width="100%" height="100%" style={{ overflow: 'visible' }}>
        <defs>
          <radialGradient id={`glow-${uid}`} cx="50%" cy="42%" r="55%">
            <stop offset="0%" stopColor="#ffcf6b" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffcf6b" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`lampBody-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e0b76e" />
            <stop offset="100%" stopColor="#8a6a37" />
          </linearGradient>
          <linearGradient id={`lampBase-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9a7940" />
            <stop offset="100%" stopColor="#6b4f28" />
          </linearGradient>
          <linearGradient id={`flameOuter-${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#e8551f" />
            <stop offset="55%" stopColor="#f6a531" />
            <stop offset="100%" stopColor="#ffe08a" />
          </linearGradient>
          <linearGradient id={`flameInner-${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#ffb454" />
            <stop offset="100%" stopColor="#fff6d8" />
          </linearGradient>
        </defs>

        {glow && (
          <circle className="flame-glow" cx="50" cy="50" r="42" fill={`url(#glow-${uid})`} />
        )}

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
