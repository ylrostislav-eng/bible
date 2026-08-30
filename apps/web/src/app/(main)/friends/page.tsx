'use client';

import type {
  ChallengeFriendResponse,
  FriendSearchResult,
  FriendsListResponse,
} from '@bible-arena/shared';
import {
  DUEL_QUESTION_COUNT_DEFAULT,
  DUEL_QUESTION_COUNT_MAX,
  DUEL_QUESTION_COUNT_MIN,
} from '@bible-arena/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FriendsIcon } from '@/components/icons/nav-icons';
import { Card } from '@/components/ui/card';
import { QuestionCountSlider } from '@/components/ui/question-count-slider';
import { Spinner } from '@/components/ui/spinner';
import { ApiError, apiClient } from '@/lib/api';
import { pluralFriends } from '@/lib/plural';

const SEARCH_DEBOUNCE_MS = 350;
/** Online status can change at any moment (a friend opens/closes the app),
 * and this page has no other signal to refetch on — poll like the duel
 * page's pending-challenges check does. */
const OVERVIEW_POLL_MS = 15000;
/** Matches the key `/play/duel` reads on mount to pick up a
 * challenge-created session without a URL param. */
const PENDING_SESSION_STORAGE_KEY = 'bible-arena:pending-duel-session';

export default function FriendsPage() {
  const router = useRouter();

  const [overview, setOverview] = useState<FriendsListResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [challengingFriendId, setChallengingFriendId] = useState<string | null>(null);
  const [challengeQuestionCount, setChallengeQuestionCount] = useState(DUEL_QUESTION_COUNT_DEFAULT);
  const [challengeSending, setChallengeSending] = useState(false);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [sentChallenge, setSentChallenge] = useState<ChallengeFriendResponse | null>(null);

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
    const interval = setInterval(() => void load(), OVERVIEW_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
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

  const openChallenge = (friendId: string) => {
    setChallengingFriendId(friendId);
    setChallengeQuestionCount(DUEL_QUESTION_COUNT_DEFAULT);
    setChallengeError(null);
    setSentChallenge(null);
  };

  const sendChallenge = async () => {
    if (!challengingFriendId) return;
    setChallengeSending(true);
    setChallengeError(null);
    try {
      const res = await apiClient.post<ChallengeFriendResponse>('/game/duel/challenge', {
        friendUserId: challengingFriendId,
        questionCount: challengeQuestionCount,
      });
      setSentChallenge(res);
    } catch (err) {
      setChallengeError(err instanceof ApiError ? err.message : 'Не удалось отправить вызов');
    } finally {
      setChallengeSending(false);
    }
  };

  const goToDuel = () => {
    if (!sentChallenge) return;
    sessionStorage.setItem(PENDING_SESSION_STORAGE_KEY, sentChallenge.sessionId);
    router.push('/play/duel');
  };

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
            <div key={friend.userId} className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
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
                <div className="flex shrink-0 items-center gap-3">
                  {friend.online && (
                    <button
                      onClick={() => openChallenge(friend.userId)}
                      className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-on-primary"
                    >
                      Вызвать
                    </button>
                  )}
                  <button
                    onClick={() => void unfriend(friend.userId)}
                    disabled={busyId === friend.userId}
                    className="text-xs text-text-muted hover:text-danger disabled:opacity-50"
                  >
                    Удалить
                  </button>
                </div>
              </div>

              {challengingFriendId === friend.userId && (
                <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-hover p-3">
                  {sentChallenge ? (
                    <>
                      <p className="text-sm text-success">Вызов отправлен!</p>
                      <p className="text-xs text-text-muted">
                        Код на всякий случай:{' '}
                        <span className="font-mono font-semibold tracking-widest text-text-primary">
                          {sentChallenge.inviteCode}
                        </span>
                      </p>
                      <button
                        onClick={goToDuel}
                        className="h-10 rounded-lg bg-primary text-sm font-semibold text-on-primary"
                      >
                        Перейти к дуэли
                      </button>
                    </>
                  ) : (
                    <>
                      <QuestionCountSlider
                        label="Количество вопросов"
                        value={challengeQuestionCount}
                        min={DUEL_QUESTION_COUNT_MIN}
                        max={DUEL_QUESTION_COUNT_MAX}
                        onChange={setChallengeQuestionCount}
                      />
                      {challengeError && <p className="text-sm text-danger">{challengeError}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={() => void sendChallenge()}
                          disabled={challengeSending}
                          className="h-10 flex-1 rounded-lg bg-primary text-sm font-semibold text-on-primary disabled:opacity-50"
                        >
                          {challengeSending ? 'Отправка…' : 'Бросить вызов'}
                        </button>
                        <button
                          onClick={() => setChallengingFriendId(null)}
                          className="h-10 rounded-lg bg-surface px-3 text-sm text-text-secondary"
                        >
                          Отмена
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
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
