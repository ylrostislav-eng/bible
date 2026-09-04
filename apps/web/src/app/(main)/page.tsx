'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Card } from '@/components/ui/card';
import { DailyGoalCard } from '@/components/daily-goal-card';
import { DailyWordCard } from '@/components/daily-word-card';
import { HotColdCard } from '@/components/hot-cold-card';
import { LearnIcon, PlayIcon, SettingsIcon, TournamentIcon } from '@/components/icons/nav-icons';

const QUICK_LINKS = [
  { href: '/play', label: 'Играть', icon: PlayIcon },
  { href: '/learn', label: 'Изучение', icon: LearnIcon },
  { href: '/tournaments', label: 'Турниры', icon: TournamentIcon },
  { href: '/settings', label: 'Настройки', icon: SettingsIcon },
] as const;

export default function HomePage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-6">
      <div>
        <p className="text-sm text-text-secondary">Мир вам,</p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{user.nickname}</h1>
          <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold text-primary">
            {user.title}
          </span>
        </div>
      </div>

      {/* Above the stat tiles on purpose: the stats say how the account is
          doing overall, this says what today needs — and today is the only
          thing a player can still act on. */}
      <DailyGoalCard user={user} />

      {/* Сразу под целью дня: обе карточки про сегодня, и слово дня — самый
          короткий способ эту цель начать. */}
      <DailyWordCard />

      {/* Вторая игра дня, с другим заходом: не пять попыток по описанию, а
          сколько угодно слов по расстоянию. */}
      <HotColdCard />

      <div className="grid grid-cols-3 gap-3">
        <Card className="flex-col items-center text-center">
          <p className="text-xs text-text-secondary">Уровень</p>
          <p className="mt-1 text-xl font-bold text-primary">{user.level}</p>
        </Card>
        <Card className="flex-col items-center text-center">
          <p className="text-xs text-text-secondary">Знания</p>
          <p className="mt-1 text-xl font-bold text-primary">{user.rating}</p>
        </Card>
        <Card className="flex-col items-center text-center">
          <p className="text-xs text-text-secondary">Монеты</p>
          <p className="mt-1 text-xl font-bold text-primary">{user.coins}</p>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-text-secondary">Быстрые действия</h2>
        <div className="grid grid-cols-2 gap-3">
          {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <Card className="flex-row items-center gap-3">
                <Icon className="h-6 w-6 text-primary" />
                <span className="font-medium">{label}</span>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
