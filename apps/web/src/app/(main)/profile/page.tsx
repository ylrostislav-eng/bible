'use client';

import { useAuth } from '@/lib/auth-context';
import { Card } from '@/components/ui/card';
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
          <h1 className="text-xl font-bold">{user.nickname}</h1>
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
          <p className="text-xs text-text-secondary">Рейтинг</p>
          <p className="text-lg font-bold text-primary">{user.rating}</p>
        </Card>
        <Card className="flex-col">
          <p className="text-xs text-text-secondary">Монеты</p>
          <p className="text-lg font-bold text-primary">{user.coins}</p>
        </Card>
      </div>

      <Card className="flex-col gap-3">
        <h2 className="text-sm font-semibold text-text-secondary">Статистика игр</h2>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-lg font-bold">{user.gamesPlayed}</p>
            <p className="text-xs text-text-secondary">Игр</p>
          </div>
          <div>
            <p className="text-lg font-bold text-success">{user.gamesWon}</p>
            <p className="text-xs text-text-secondary">Побед</p>
          </div>
          <div>
            <p className="text-lg font-bold text-danger">{user.gamesLost}</p>
            <p className="text-xs text-text-secondary">Поражений</p>
          </div>
          <div>
            <p className="text-lg font-bold">{user.winRate}%</p>
            <p className="text-xs text-text-secondary">Побед</p>
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
    </div>
  );
}
