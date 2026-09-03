'use client';

import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_CATEGORY_NAMES,
  type AchievementView,
  type AchievementsResponse,
} from '@bible-arena/shared';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { pluralCoins } from '@/lib/plural';
import { Card } from './ui/card';
import { Spinner } from './ui/spinner';

/**
 * The profile's achievements list.
 *
 * Locked entries are shown, not hidden: a list of things you could still
 * earn is the whole reason the section exists, and hiding them leaves a new
 * player with an empty card that says nothing about what the app wants from
 * them. Each locked row carries its own progress, so "10 разных глав" reads
 * as 3/10 rather than as a closed door.
 */
export function AchievementsSection() {
  const [data, setData] = useState<AchievementsResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiClient.get<AchievementsResponse>('/achievements');
        if (!cancelled) setData(res);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <Card className="flex-col gap-2">
        <h2 className="text-sm font-semibold text-text-secondary">Достижения</h2>
        <p className="text-sm text-text-secondary">
          Не удалось загрузить достижения — попробуйте открыть профиль ещё раз.
        </p>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="flex-row items-center justify-center py-6">
        <Spinner className="h-5 w-5" />
      </Card>
    );
  }

  return (
    <Card className="flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-text-secondary">Достижения</h2>
        <p className="text-xs text-text-secondary">
          {data.unlockedCount} из {data.totalCount}
        </p>
      </div>

      {data.newlyUnlocked.length > 0 && (
        // The server reports anything unlocked in the last few minutes, so
        // this survives a remount or a refresh on the way here — otherwise
        // the moment is a coin balance that silently went up.
        <div className="rounded-xl border border-primary bg-primary/10 p-3">
          <p className="text-sm font-semibold text-primary">
            {data.newlyUnlocked.length === 1
              ? 'Новое достижение!'
              : `Новых достижений: ${data.newlyUnlocked.length}`}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            {data.newlyUnlocked.map((a) => `${a.icon} ${a.name}`).join(' · ')} — +
            {data.newlyUnlocked.reduce((sum, a) => sum + a.coins, 0)}{' '}
            {pluralCoins(data.newlyUnlocked.reduce((sum, a) => sum + a.coins, 0))}
          </p>
        </div>
      )}

      {ACHIEVEMENT_CATEGORIES.map((category) => {
        const rows = data.achievements.filter((a) => a.category === category);
        if (rows.length === 0) return null;
        return (
          <div key={category} className="flex flex-col gap-2">
            <p className="text-xs font-medium text-text-secondary">
              {ACHIEVEMENT_CATEGORY_NAMES[category]}
            </p>
            {rows.map((achievement) => (
              <AchievementRow key={achievement.id} achievement={achievement} />
            ))}
          </div>
        );
      })}
    </Card>
  );
}

function AchievementRow({ achievement }: { achievement: AchievementView }) {
  const percent = Math.min(100, Math.floor((achievement.progress / achievement.target) * 100));

  return (
    <div className="flex items-center gap-3">
      <div
        className={clsx(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg',
          achievement.unlocked
            ? 'bg-primary/15'
            : // Locked icons stay visible but desaturated: a grey silhouette
              // says "not yet", a hidden one says nothing at all.
              'bg-surface-hover opacity-40 grayscale',
        )}
        aria-hidden
      >
        {achievement.icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={clsx(
              'truncate text-sm font-medium',
              !achievement.unlocked && 'text-text-secondary',
            )}
          >
            {achievement.name}
          </p>
          {!achievement.unlocked && (
            <p className="shrink-0 text-xs tabular-nums text-text-secondary">
              {achievement.progress}/{achievement.target}
            </p>
          )}
        </div>
        <p className="truncate text-xs text-text-secondary">{achievement.description}</p>
        {!achievement.unlocked && (
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-hover">
            <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
