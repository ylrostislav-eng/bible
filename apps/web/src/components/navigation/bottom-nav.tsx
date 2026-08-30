'use client';

import { XP_PER_LEVEL } from '@bible-arena/shared';
import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { HomeIcon, PlayIcon, RatingIcon, FriendsIcon, ProfileIcon } from '../icons/nav-icons';

const TABS = [
  { href: '/', label: 'Главная', icon: HomeIcon },
  { href: '/play', label: 'Играть', icon: PlayIcon },
  { href: '/rating', label: 'Знания', icon: RatingIcon },
  { href: '/friends', label: 'Друзья', icon: FriendsIcon },
  { href: '/profile', label: 'Профиль', icon: ProfileIcon },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  const xpIntoLevel = user ? ((user.experience % XP_PER_LEVEL) + XP_PER_LEVEL) % XP_PER_LEVEL : 0;
  const xpProgress = (xpIntoLevel / XP_PER_LEVEL) * 100;

  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={clsx(
                  'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-text-muted hover:text-text-secondary',
                )}
              >
                <Icon className="h-6 w-6" strokeWidth={active ? 2.1 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      {user && (
        <div
          className="h-1 w-full bg-surface-hover"
          role="progressbar"
          aria-label={`Опыт до уровня ${user.level + 1}`}
          aria-valuenow={Math.round(xpProgress)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full bg-primary transition-all" style={{ width: `${xpProgress}%` }} />
        </div>
      )}
    </nav>
  );
}
