'use client';

import type { LeaderboardEntry, LeaderboardResponse } from '@bible-arena/shared';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { RatingIcon } from '@/components/icons/nav-icons';
import { Card } from '@/components/ui/card';
import { ApiError, apiClient } from '@/lib/api';

function Avatar({ entry }: { entry: LeaderboardEntry }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-hover text-sm font-bold text-primary">
      {entry.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.avatarUrl}
          alt={entry.nickname ?? ''}
          className="h-full w-full object-cover"
        />
      ) : (
        (entry.nickname ?? '?').slice(0, 1).toUpperCase()
      )}
    </div>
  );
}

function Row({ entry }: { entry: LeaderboardEntry }) {
  return (
    <div
      className={clsx(
        'flex items-center gap-3 rounded-xl px-3 py-2.5',
        entry.isMe && 'border border-primary bg-primary/10',
      )}
    >
      <span className="w-6 shrink-0 text-center text-sm font-bold text-text-secondary">
        {entry.rank}
      </span>
      <Avatar entry={entry} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{entry.nickname}</p>
        <p className="truncate text-xs text-text-secondary">
          {entry.title} · {entry.gamesWon}W/{entry.gamesLost}L
        </p>
      </div>
      <span className="shrink-0 text-sm font-bold text-primary">{entry.rating}</span>
    </div>
  );
}

export default function RatingPage() {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get<LeaderboardResponse>('/users/leaderboard');
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Не удалось загрузить рейтинг');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface">
          <RatingIcon className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Знания</h1>
          <p className="text-sm text-text-secondary">Лучшие по знанию Библии</p>
        </div>
      </div>

      {loading && <p className="text-center text-sm text-text-secondary">Загрузка…</p>}
      {error && <p className="text-center text-sm text-danger">{error}</p>}

      {data && (
        <>
          {data.entries.length === 0 ? (
            <Card className="flex-col items-center gap-1 py-6 text-center">
              <p className="text-sm text-text-secondary">Рейтинг пока пуст</p>
              <p className="text-xs text-text-muted">
                Сыграйте дуэль, чтобы попасть в таблицу лидеров
              </p>
            </Card>
          ) : (
            <Card className="flex-col gap-1">
              {data.entries.map((entry) => (
                <Row key={entry.id} entry={entry} />
              ))}
            </Card>
          )}

          {data.me && (
            <Card className="flex-col gap-1">
              <p className="px-1 text-xs font-semibold text-text-secondary">Ваше место</p>
              <Row entry={data.me} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
