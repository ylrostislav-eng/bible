'use client';

import type { FriendSearchResult, FriendsListResponse } from '@bible-arena/shared';
import { useEffect, useState } from 'react';
import { ApiError, apiClient } from '@/lib/api';
import { Card } from './ui/card';
import { Spinner } from './ui/spinner';

const SEARCH_DEBOUNCE_MS = 350;

interface RoomInvitePickerProps {
  sessionId: string;
  /** Already-in-the-room ids — hidden from the list, inviting them again is
   * meaningless. */
  excludeUserIds: string[];
}

/**
 * Leader-only friend picker in the room lobby — search by nickname or pick
 * from the friends list, click "Пригласить" to send a direct room invite
 * (no code/password needed on the other end). Deliberately simpler than
 * `FriendChallengeList`: there's no per-invite setting to configure (unlike
 * a duel's question count), so a single click is the whole flow — tracked
 * locally via `invitedIds` rather than round-tripping through the pending
 * list, since this leader has no reason to see who else already has one.
 */
export function RoomInvitePicker({ sessionId, excludeUserIds }: RoomInvitePickerProps) {
  const [overview, setOverview] = useState<FriendsListResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

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

  const invite = async (userId: string) => {
    setInvitingId(userId);
    setInviteError(null);
    try {
      await apiClient.post(`/rooms/${sessionId}/invite`, { userId });
      setInvitedIds((ids) => new Set(ids).add(userId));
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : 'Не удалось отправить приглашение');
    } finally {
      setInvitingId(null);
    }
  };

  const excluded = new Set(excludeUserIds);
  const friends = (overview?.friends ?? []).filter((f) => !excluded.has(f.userId));
  const friendSearchResults = searchResults.filter(
    (r) => !excluded.has(r.userId) && r.relation === 'friend',
  );

  return (
    <div className="flex flex-col gap-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Найти друга по нику…"
        className="h-11 rounded-xl border border-border bg-surface px-4 text-sm outline-none focus:border-primary"
      />

      {inviteError && <p className="text-sm text-danger">{inviteError}</p>}
      {loadError && <p className="text-sm text-danger">{loadError}</p>}

      {query.trim().length >= 2 ? (
        <Card className="flex-col gap-2">
          {searching ? (
            <div className="flex justify-center py-2">
              <Spinner />
            </div>
          ) : friendSearchResults.length === 0 ? (
            <p className="py-2 text-center text-sm text-text-muted">
              Среди друзей с таким ником никто не найден
            </p>
          ) : (
            friendSearchResults.map((result) => (
              <InviteRow
                key={result.userId}
                userId={result.userId}
                nickname={result.nickname}
                subtitle={`${result.title} · ур. ${result.level}`}
                invited={invitedIds.has(result.userId)}
                busy={invitingId === result.userId}
                onInvite={() => void invite(result.userId)}
              />
            ))
          )}
        </Card>
      ) : !overview ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : friends.length === 0 ? (
        <p className="py-2 text-center text-sm text-text-secondary">
          Пока нет друзей, кого можно пригласить
        </p>
      ) : (
        <Card className="flex-col gap-2">
          {friends.map((friend) => (
            <InviteRow
              key={friend.userId}
              userId={friend.userId}
              nickname={friend.nickname}
              subtitle={`${friend.title} · ур. ${friend.level}`}
              online={friend.online}
              invited={invitedIds.has(friend.userId)}
              busy={invitingId === friend.userId}
              onInvite={() => void invite(friend.userId)}
            />
          ))}
        </Card>
      )}
    </div>
  );
}

function InviteRow({
  nickname,
  subtitle,
  online,
  invited,
  busy,
  onInvite,
}: {
  userId: string;
  nickname: string | null;
  subtitle: string;
  online?: boolean;
  invited: boolean;
  busy: boolean;
  onInvite: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <div className="flex min-w-0 items-center gap-2">
        {online !== undefined && (
          <span
            className={
              online
                ? 'h-2 w-2 shrink-0 rounded-full bg-success'
                : 'h-2 w-2 shrink-0 rounded-full bg-text-muted'
            }
          />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{nickname ?? 'Игрок'}</p>
          <p className="text-xs text-text-muted">{subtitle}</p>
        </div>
      </div>
      <button
        onClick={onInvite}
        disabled={busy || invited}
        className="h-9 shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-on-primary disabled:opacity-50"
      >
        {invited ? 'Приглашён' : busy ? 'Отправка…' : 'Пригласить'}
      </button>
    </div>
  );
}
