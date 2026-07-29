'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Card } from '@/components/ui/card';
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
        <h1 className="text-2xl font-bold">{user.nickname}</h1>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="flex-col items-center text-center">
          <p className="text-xs text-text-secondary">Уровень</p>
          <p className="mt-1 text-xl font-bold text-primary">{user.level}</p>
        </Card>
        <Card className="flex-col items-center text-center">
          <p className="text-xs text-text-secondary">Рейтинг</p>
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
