'use client';

import { XP_PER_LEVEL } from '@bible-arena/shared';
import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useActiveGame } from '@/lib/active-game-context';
import { useAuth } from '@/lib/auth-context';
import type { ActiveGameType } from '@/lib/active-game-context';
import { HomeIcon, PlayIcon, RatingIcon, FriendsIcon, ProfileIcon } from '../icons/nav-icons';

/**
 * Куда ведёт «Играть», пока идёт партия.
 *
 * Таблицей, а не подстановкой типа в `/play/${type}`: «горячо-холодно»
 * живёт по своему адресу, и склейка отправила бы игрока на
 * несуществующую страницу. Один режим уже сломал бы это молча.
 */
const RESUME_HREF: Record<ActiveGameType, string> = {
  duel: '/play/duel',
  room: '/play/room',
  alias: '/play/alias',
  'hot-cold-duel': '/hot-cold/duel',
  dice: '/play/dice',
};

const TABS = [
  { href: '/', label: 'Главная', icon: HomeIcon },
  { href: '/play', label: 'Играть', icon: PlayIcon },
  { href: '/rating', label: 'Знания', icon: RatingIcon },
  { href: '/players', label: 'Игроки', icon: FriendsIcon },
  { href: '/profile', label: 'Профиль', icon: ProfileIcon },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { activeGame } = useActiveGame();

  const xpIntoLevel = user ? ((user.experience % XP_PER_LEVEL) + XP_PER_LEVEL) % XP_PER_LEVEL : 0;
  const xpProgress = (xpIntoLevel / XP_PER_LEVEL) * 100;

  return (
    <nav className="app-band pb-safe fixed bottom-0 z-20 border-t border-border bg-bg/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2">
        {TABS.map(({ href, label, icon: Icon }) => {
          // While a duel/room is in progress, "Играть" jumps straight back
          // into it instead of the mode-picker menu — the game keeps running
          // in the background (see ActiveGameProvider) no matter which tab
          // you're on, so this is how you find your way back to it.
          const isPlayTab = href === '/play';
          const targetHref = isPlayTab && activeGame ? RESUME_HREF[activeGame.type] : href;
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={targetHref}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-text-muted hover:text-text-secondary',
                )}
              >
                <span className="relative flex h-8 w-14 items-center justify-center">
                  {/* Подложка под иконкой — и есть ответ на вопрос «где я
                      сейчас». До неё активную вкладку отличал только цвет
                      значка, а пять одинаковых по форме значков в ряд
                      глазом сравниваются плохо: чтобы понять, какой из
                      них янтарный, приходится смотреть на все пять.
                      Заливка меняет форму, а форма видна боковым зрением.

                      Она всегда в разметке и всегда одного размера, а
                      переключается прозрачностью и масштабом: так
                      появление получается плавным, а ширина вкладки не
                      скачет при переходе. */}
                  <span
                    className={clsx(
                      // Свечение — не украшение ради украшения: нижняя
                      // панель размывает фон под собой, и на размытом
                      // подложка без отрыва от фона читается пятном
                      // грязи. Тонкий ореол отделяет её от панели.
                      'absolute inset-0 rounded-2xl bg-primary/15 shadow-[0_0_14px_-3px_rgba(232,176,75,0.45)] ring-1 ring-primary/30 transition duration-200',
                      active ? 'scale-100 opacity-100' : 'scale-90 opacity-0',
                    )}
                  />
                  <span className="relative">
                    <Icon className="h-6 w-6" strokeWidth={active ? 2.1 : 1.8} />
                    {isPlayTab && activeGame && (
                      <span className="absolute -top-0.5 -right-0.5 h-2 w-2 animate-pulse rounded-full bg-danger" />
                    )}
                  </span>
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
