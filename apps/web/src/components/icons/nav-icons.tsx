import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function HomeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H10v-5.5a2 2 0 0 1 2-2v0a2 2 0 0 1 2 2V20h3.5a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l6-3.5-6-3.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function RatingIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5 14.4 9l6.1.5-4.6 4 1.4 5.9L12 16.7 6.7 19.4l1.4-5.9-4.6-4L9.6 9 12 3.5Z" />
    </svg>
  );
}

export function FriendsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="8.5" cy="8" r="3" />
      <circle cx="16.5" cy="9" r="2.5" />
      <path d="M3 20v-1a5 5 0 0 1 5-5h1a5 5 0 0 1 5 5v1" />
      <path d="M15 14.2a4 4 0 0 1 6 3.3V19" />
    </svg>
  );
}

export function ProfileIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

export function TournamentIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" />
      <path d="M12 13v3M9 20h6M10 16h4v4h-4v-4Z" />
    </svg>
  );
}

export function LearnIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v18H6.5A2.5 2.5 0 0 1 4 18.5v-13Z" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H12v18h5.5a2.5 2.5 0 0 0 2.5-2.5v-13Z" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.8-1.4-2-3.4-2.1.6a7.7 7.7 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.3a7.7 7.7 0 0 0-2.6 1.5l-2.1-.6-2 3.4L4.6 10.5a7.6 7.6 0 0 0 0 3l-1.8 1.4 2 3.4 2.1-.6a7.7 7.7 0 0 0 2.6 1.5l.5 2.3h4l.5-2.3a7.7 7.7 0 0 0 2.6-1.5l2.1.6 2-3.4-1.8-1.4Z" />
    </svg>
  );
}
