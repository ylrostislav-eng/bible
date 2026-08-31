'use client';

import { XP_PER_LEVEL } from '@bible-arena/shared';
import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useActiveGame } from '@/lib/active-game-context';
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
  const { activeGame } = useActiveGame();

  const xpIntoLevel = user ? ((user.experience % XP_PER_LEVEL) + XP_PER_LEVEL) % XP_PER_LEVEL : 0;
  const xpProgress = (xpIntoLevel / XP_PER_LEVEL) * 100;

  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2">
        {TABS.map(({ href, label, icon: Icon }) => {
          // While a duel/room is in progress, "Играть" jumps straight back
          // into it instead of the mode-picker menu — the game keeps running
          // in the background (see ActiveGameProvider) no matter which tab
          // you're on, so this is how you find your way back to it.
          const isPlayTab = href === '/play';
          const targetHref = isPlayTab && activeGame ? `/play/${activeGame.type}` : href;
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={targetHref}
                className={clsx(
                  'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-text-muted hover:text-text-secondary',
                )}
              >
                <span className="relative">
                  <Icon className="h-6 w-6" strokeWidth={active ? 2.1 : 1.8} />
                  {isPlayTab && activeGame && (
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-danger" />
                  )}
                </span>
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
