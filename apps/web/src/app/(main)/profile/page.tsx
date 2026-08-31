'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Card } from '@/components/ui/card';
import { OilLampFlame } from '@/components/ui/oil-lamp-flame';
import { pluralDraws, pluralDuels, pluralLosses, pluralWins } from '@/lib/plural';
import { COUNTRIES } from '@bible-arena/shared';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;

  const country = COUNTRIES.find((c) => c.code === user.country);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-6">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-hover text-xl font-bold text-primary">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatarUrl}
              alt={user.nickname ?? ''}
              className="h-full w-full object-cover"
            />
          ) : (
            (user.nickname ?? '?').slice(0, 1).toUpperCase()
          )}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold">{user.nickname}</h1>
            <span className="rounded-full bg-surface-hover px-2.5 py-0.5 text-xs font-semibold text-primary">
              {user.title}
            </span>
          </div>
          <p className="text-sm text-text-secondary">
            {user.telegramUsername ? `@${user.telegramUsername}` : 'Уровень ' + user.level}
            {country ? ` · ${country.nameRu}` : ''}
          </p>
          <p className="text-xs text-text-muted">На платформе с {formatDate(user.createdAt)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="flex-col">
          <p className="text-xs text-text-secondary">Уровень</p>
          <p className="text-lg font-bold text-primary">{user.level}</p>
        </Card>
        <Card className="flex-col">
          <p className="text-xs text-text-secondary">Опыт</p>
          <p className="text-lg font-bold text-primary">{user.experience}</p>
        </Card>
        <Card className="flex-col">
          <p className="text-xs text-text-secondary">Знания</p>
          <p className="text-lg font-bold text-primary">{user.rating}</p>
        </Card>
        <Card className="flex-col">
          <p className="text-xs text-text-secondary">Монеты</p>
          <p className="text-lg font-bold text-primary">{user.coins}</p>
        </Card>
        <Card className="flex-col">
          <p className="text-xs text-text-secondary">Серия дней</p>
          <div className="flex items-center gap-1.5">
            <OilLampFlame size={18} glow={false} />
            <p className="text-lg font-bold text-primary">{user.currentStreak}</p>
          </div>
        </Card>
      </div>

      <Card className="flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-text-secondary">Статистика дуэлей</h2>
          <p className="text-xs text-text-muted">
            {user.duelsPlayed} {pluralDuels(user.duelsPlayed)}
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-lg font-bold text-success">{user.gamesWon}</p>
            <p className="text-xs text-text-secondary">{pluralWins(user.gamesWon)}</p>
          </div>
          <div>
            <p className="text-lg font-bold text-text-muted">{user.gamesDrawn}</p>
            <p className="text-xs text-text-secondary">{pluralDraws(user.gamesDrawn)}</p>
          </div>
          <div>
            <p className="text-lg font-bold text-danger">{user.gamesLost}</p>
            <p className="text-xs text-text-secondary">{pluralLosses(user.gamesLost)}</p>
          </div>
          <div>
            <p className="text-lg font-bold">{user.winRate}%</p>
            <p className="text-xs text-text-secondary">побед</p>
          </div>
        </div>
      </Card>

      <Card className="flex-col gap-2">
        <h2 className="text-sm font-semibold text-text-secondary">Достижения</h2>
        <p className="text-sm text-text-muted">
          Пока нет достижений — они появятся, когда заработаете первые награды.
        </p>
      </Card>

      <Card className="flex-col gap-2">
        <h2 className="text-sm font-semibold text-text-secondary">Любимые книги</h2>
        <p className="text-sm text-text-muted">
          Появятся автоматически на основе ваших результатов в режиме изучения.
        </p>
      </Card>

      <Link href="/profile/blacklist">
        <Card className="flex-row items-center justify-between">
          <h2 className="text-sm font-semibold text-text-secondary">Чёрный список</h2>
          <span className="text-text-muted">›</span>
        </Card>
      </Link>
    </div>
  );
}
