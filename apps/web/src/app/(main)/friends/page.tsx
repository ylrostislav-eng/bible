'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { FriendsListResponse } from '@bible-arena/shared';
import { FriendsIcon } from '@/components/icons/nav-icons';
import { FriendChallengeList } from '@/components/friend-challenge-list';
import { Card } from '@/components/ui/card';
import { ApiError, apiClient } from '@/lib/api';
import { pluralFriends } from '@/lib/plural';

/** Matches the key `/play/duel` reads on mount to pick up a
 * challenge-created session without a URL param. */
const PENDING_SESSION_STORAGE_KEY = 'bible-arena:pending-duel-session';

export default function FriendsPage() {
  const router = useRouter();

  const [overview, setOverview] = useState<FriendsListResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Bumped after accept/decline/unfriend to make FriendChallengeList refetch
  // its own overview immediately instead of waiting for its poll interval.
  const [refreshKey, setRefreshKey] = useState(0);

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
  }, [refreshKey]);

  const withBusy = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    try {
      await action();
    } finally {
      setBusyId(null);
      setRefreshKey((k) => k + 1);
    }
  };

  const acceptRequest = (requestId: string) =>
    withBusy(requestId, () => apiClient.post(`/friends/requests/${requestId}/accept`));

  const declineRequest = (requestId: string) =>
    withBusy(requestId, () => apiClient.post(`/friends/requests/${requestId}/decline`));

  const unfriend = (friendId: string) =>
    withBusy(friendId, () => apiClient.delete(`/friends/${friendId}`));

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

      <FriendChallengeList
        key={refreshKey}
        onChallengeSent={(sessionId) => {
          sessionStorage.setItem(PENDING_SESSION_STORAGE_KEY, sessionId);
          router.push('/play/duel');
        }}
        renderFriendExtra={(friend) => (
          <button
            onClick={() => void unfriend(friend.userId)}
            disabled={busyId === friend.userId}
            className="text-xs text-text-muted hover:text-danger disabled:opacity-50"
          >
            Удалить
          </button>
        )}
      />
    </div>
  );
}
