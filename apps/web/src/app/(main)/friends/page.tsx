'use client';

import type { FriendSearchResult, FriendsListResponse } from '@bible-arena/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FriendsIcon } from '@/components/icons/nav-icons';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { ApiError, apiClient } from '@/lib/api';
import { pluralFriends } from '@/lib/plural';

const SEARCH_DEBOUNCE_MS = 350;

export default function FriendsPage() {
  const [overview, setOverview] = useState<FriendsListResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Reusable from mutation handlers (accept/decline/unfriend/etc.) below —
  // those aren't effect bodies, so calling it there doesn't hit the same
  // set-state-in-effect concern as the mount effect does.
  const loadOverview = useCallback(async () => {
    try {
      const data = await apiClient.get<FriendsListResponse>('/friends');
      setOverview(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Не удалось загрузить друзей');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await apiClient.get<FriendsListResponse>('/friends');
        if (!cancelled) {
          setOverview(data);
          setLoadError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : 'Не удалось загрузить друзей');
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const sendRequest = (userId: string) =>
    withBusy(userId, async () => {
      await apiClient.post('/friends/requests', { toUserId: userId });
      setSearchResults((rs) =>
        rs.map((r) => (r.userId === userId ? { ...r, relation: 'outgoing' } : r)),
      );
      await loadOverview();
    });

  const acceptRequest = (requestId: string) =>
    withBusy(requestId, async () => {
      await apiClient.post(`/friends/requests/${requestId}/accept`);
      await loadOverview();
    });

  const declineRequest = (requestId: string) =>
    withBusy(requestId, async () => {
      await apiClient.post(`/friends/requests/${requestId}/decline`);
      await loadOverview();
    });

  const unfriend = (friendId: string) =>
    withBusy(friendId, async () => {
      await apiClient.delete(`/friends/${friendId}`);
      await loadOverview();
    });

  const onlineCount = useMemo(
    () => overview?.friends.filter((f) => f.online).length ?? 0,
    [overview],
  );

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-6">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface">
          <FriendsIcon className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Друзья</h1>
          {overview && (
            <p className="text-sm text-text-secondary">
              {overview.friends.length} {pluralFriends(overview.friends.length)} · {onlineCount} в
              сети
            </p>
          )}
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">Найти по нику</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Введите никнейм…"
          className="h-12 rounded-xl border border-border bg-surface px-4 text-sm outline-none focus:border-primary"
        />
      </label>

      {query.trim().length >= 2 && (
        <Card className="flex-col gap-2">
          {searching ? (
            <div className="flex justify-center py-2">
              <Spinner />
            </div>
          ) : searchResults.length === 0 ? (
            <p className="py-2 text-center text-sm text-text-muted">Никто не найден</p>
          ) : (
            searchResults.map((result) => (
              <div key={result.userId} className="flex items-center justify-between gap-2 py-1">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{result.nickname}</p>
                  <p className="text-xs text-text-muted">
                    {result.title} · ур. {result.level}
                  </p>
                </div>
                <SearchRelationAction
                  result={result}
                  busy={busyId === result.userId}
                  onAdd={() => sendRequest(result.userId)}
                />
              </div>
            ))
          )}
        </Card>
      )}

      {loadError && <p className="text-sm text-danger">{loadError}</p>}

      {overview && overview.incomingRequests.length > 0 && (
        <Card className="flex-col gap-3">
          <p className="text-sm font-semibold text-text-secondary">Входящие заявки</p>
          {overview.incomingRequests.map((req) => (
            <div key={req.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{req.nickname}</p>
                <p className="text-xs text-text-muted">
                  {req.title} · ур. {req.level}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => void acceptRequest(req.id)}
                  disabled={busyId === req.id}
                  className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-on-primary disabled:opacity-50"
                >
                  Принять
                </button>
                <button
                  onClick={() => void declineRequest(req.id)}
                  disabled={busyId === req.id}
                  className="h-9 rounded-lg bg-surface-hover px-3 text-xs font-semibold text-text-secondary disabled:opacity-50"
                >
                  Отклонить
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {overview && overview.outgoingRequests.length > 0 && (
        <Card className="flex-col gap-2">
          <p className="text-sm font-semibold text-text-secondary">Отправленные заявки</p>
          {overview.outgoingRequests.map((req) => (
            <div key={req.id} className="flex items-center justify-between gap-2">
              <p className="truncate text-sm">{req.nickname}</p>
              <span className="shrink-0 text-xs text-text-muted">Ожидает ответа</span>
            </div>
          ))}
        </Card>
      )}

      {!overview ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : overview.friends.length === 0 ? (
        <p className="pt-4 text-center text-sm text-text-secondary">
          Пока нет друзей — найдите кого-нибудь по нику выше.
        </p>
      ) : (
        <Card className="flex-col gap-3">
          {overview.friends.map((friend) => (
            <div key={friend.userId} className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={
                    friend.online
                      ? 'h-2 w-2 shrink-0 rounded-full bg-success'
                      : 'h-2 w-2 shrink-0 rounded-full bg-text-muted'
                  }
                  aria-label={friend.online ? 'В сети' : 'Не в сети'}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{friend.nickname}</p>
                  <p className="text-xs text-text-muted">
                    {friend.title} · ур. {friend.level}
                  </p>
                </div>
              </div>
              <button
                onClick={() => void unfriend(friend.userId)}
                disabled={busyId === friend.userId}
                className="shrink-0 text-xs text-text-muted hover:text-danger disabled:opacity-50"
              >
                Удалить
              </button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function SearchRelationAction({
  result,
  busy,
  onAdd,
}: {
  result: FriendSearchResult;
  busy: boolean;
  onAdd: () => void;
}) {
  if (result.relation === 'friend') {
    return <span className="shrink-0 text-xs text-text-muted">Уже друзья</span>;
  }
  if (result.relation === 'outgoing') {
    return <span className="shrink-0 text-xs text-text-muted">Заявка отправлена</span>;
  }
  if (result.relation === 'incoming') {
    return <span className="shrink-0 text-xs text-text-muted">Ждёт вашего ответа</span>;
  }
  return (
    <button
      onClick={onAdd}
      disabled={busy}
      className="h-9 shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-on-primary disabled:opacity-50"
    >
      Добавить
    </button>
  );
}
