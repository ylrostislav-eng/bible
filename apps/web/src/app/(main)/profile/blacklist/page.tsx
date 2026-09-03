'use client';

import type { BannedUserView, FriendSearchResult } from '@bible-arena/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { ApiError, apiClient } from '@/lib/api';
import { pluralPlayers } from '@/lib/plural';

const SEARCH_DEBOUNCE_MS = 350;

export default function BlacklistPage() {
  const [banned, setBanned] = useState<BannedUserView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Reusable from mutation handlers (ban/unban) below — those aren't effect
  // bodies, so calling it there doesn't hit the set-state-in-effect concern
  // the mount effect does.
  const loadBanned = useCallback(async () => {
    try {
      const data = await apiClient.get<BannedUserView[]>('/rooms/banned');
      setBanned(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Не удалось загрузить чёрный список');
    }
  }, []);

  useEffect(() => {
    function fetchOnMount() {
      void loadBanned();
    }
    fetchOnMount();
  }, [loadBanned]);

  useEffect(() => {
    let cancelled = false;
    const q = query.trim();

    async function run() {
      if (q.length < 2) {
        if (!cancelled) {
          setSearchResults([]);
          setSearching(false);
        }
        return;
      }
      if (!cancelled) setSearching(true);
      try {
        // Reuses the general nickname search behind the friends screen —
        // it already returns any user (not just friends), so there's no
        // need for a second, near-identical search endpoint just for bans.
        const results = await apiClient.get<FriendSearchResult[]>(
          `/friends/search?q=${encodeURIComponent(q)}`,
        );
        if (!cancelled) setSearchResults(results);
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }

    const timeout = setTimeout(() => void run(), q.length < 2 ? 0 : SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  const withBusy = useCallback(async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    try {
      await action();
    } finally {
      setBusyId(null);
    }
  }, []);

  const banUser = (userId: string) =>
    withBusy(userId, async () => {
      await apiClient.post('/rooms/banned', { userId });
      await loadBanned();
    });

  const unbanUser = (userId: string) =>
    withBusy(userId, async () => {
      await apiClient.delete(`/rooms/banned/${userId}`);
      await loadBanned();
    });

  const bannedIds = new Set((banned ?? []).map((b) => b.userId));

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-6">
      <div>
        <h1 className="text-xl font-bold">Чёрный список</h1>
        <p className="text-sm text-text-secondary">
          Эти игроки не смогут зайти в ваши комнаты или бросить вам вызов на дуэль
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">
          Найти игрока, чтобы заблокировать
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Введите игровой никнейм…"
          className="h-12 rounded-xl border border-border bg-surface px-4 text-sm outline-none focus:border-primary"
        />
      </label>

      {query.trim().length === 1 && (
        <p className="-mt-3 text-xs text-text-muted">Введите ещё хотя бы один символ</p>
      )}

      {query.trim().length >= 2 && (
        <Card className="flex-col gap-2">
          {searching ? (
            <div className="flex justify-center py-2">
              <Spinner />
            </div>
          ) : searchResults.length === 0 ? (
            <p className="py-2 text-center text-sm text-text-muted">
              Никто не найден — проверьте, что ищете по игровому нику, а не по имени в Telegram
            </p>
          ) : (
            searchResults.map((result) => (
              <div key={result.userId} className="flex items-center justify-between gap-2 py-1">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{result.nickname}</p>
                  <p className="text-xs text-text-muted">
                    {result.title} · ур. {result.level}
                  </p>
                </div>
                {bannedIds.has(result.userId) ? (
                  <span className="shrink-0 text-xs text-text-muted">В чёрном списке</span>
                ) : (
                  <button
                    onClick={() => void banUser(result.userId)}
                    disabled={busyId === result.userId}
                    className="h-9 shrink-0 rounded-lg bg-danger/10 px-3 text-xs font-semibold text-danger disabled:opacity-50"
                  >
                    Забанить
                  </button>
                )}
              </div>
            ))
          )}
        </Card>
      )}

      {loadError && <p className="text-sm text-danger">{loadError}</p>}

      {!banned ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : banned.length === 0 ? (
        <p className="pt-4 text-center text-sm text-text-secondary">
          Чёрный список пуст — заблокированные игроки появятся здесь.
        </p>
      ) : (
        <Card className="flex-col gap-3">
          <p className="text-sm font-semibold text-text-secondary">
            {banned.length} {pluralPlayers(banned.length)} в чёрном списке
          </p>
          {banned.map((b) => (
            <div key={b.userId} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{b.nickname ?? 'Игрок'}</p>
                <p className="text-xs text-text-muted">
                  {b.title} · ур. {b.level}
                </p>
              </div>
              <button
                onClick={() => void unbanUser(b.userId)}
                disabled={busyId === b.userId}
                className="h-9 shrink-0 rounded-lg bg-surface-hover px-3 text-xs font-semibold text-text-secondary disabled:opacity-50"
              >
                Разбанить
              </button>
            </div>
          ))}
        </Card>
      )}

      <Link href="/profile" className="text-center text-sm text-text-secondary">
        Назад
      </Link>
    </div>
  );
}
