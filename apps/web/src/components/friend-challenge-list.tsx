'use client';

import type {
  BannedUserView,
  ChallengeFriendResponse,
  FriendSearchResult,
  FriendsListResponse,
  FriendView,
} from '@bible-arena/shared';
import {
  DUEL_QUESTION_COUNT_DEFAULT,
  DUEL_QUESTION_COUNT_MAX,
  DUEL_QUESTION_COUNT_MIN,
} from '@bible-arena/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ApiError, apiClient } from '@/lib/api';
import { useChat } from '@/lib/chat-context';
import { Card } from './ui/card';
import { QuestionCountSlider } from './ui/question-count-slider';
import { Spinner } from './ui/spinner';
import { UserActionSheet } from './user-action-sheet';

const SEARCH_DEBOUNCE_MS = 350;
/** Online status can change at any moment (a friend opens/closes the app),
 * and there's no other signal to refetch on. */
const OVERVIEW_POLL_MS = 15000;

interface FriendChallengeListProps {
  /** Called once a challenge is successfully sent, with the new session id
   * — the caller decides what to do next (navigate to the duel page,
   * stash it for a handoff, etc.), since that differs by where this is
   * embedded. */
  onChallengeSent: (sessionId: string) => void;
  /** Extra content rendered at the end of each friend row, after "Вызвать"
   * — e.g. the Friends page's "Удалить" (unfriend) button, which this
   * component itself has no opinion on. */
  renderFriendExtra?: (friend: FriendView) => ReactNode;
  /** Shown in place of the friends list when it's empty. */
  emptyMessage?: string;
}

/**
 * Search-a-player-by-nickname + friends-list-with-"Вызвать" — the shared
 * core of both the Friends tab and the Duel tab's "Создать дуэль" friend
 * picker, so the two don't drift into two slightly-different
 * implementations of the same search/add/challenge flow.
 */
interface ActionSheetTarget {
  userId: string;
  nickname: string | null;
  isFriend: boolean;
}

export function FriendChallengeList({
  onChallengeSent,
  renderFriendExtra,
  emptyMessage,
}: FriendChallengeListProps) {
  const { openThread } = useChat();
  const [overview, setOverview] = useState<FriendsListResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bannedIds, setBannedIds] = useState<Set<string>>(new Set());
  const [actionSheetFor, setActionSheetFor] = useState<ActionSheetTarget | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [challengingFriendId, setChallengingFriendId] = useState<string | null>(null);
  const [challengeQuestionCount, setChallengeQuestionCount] = useState(DUEL_QUESTION_COUNT_DEFAULT);
  const [challengeSending, setChallengeSending] = useState(false);
  const [challengeError, setChallengeError] = useState<string | null>(null);

  // Reusable from sendRequest below — not an effect body, so calling it
  // there doesn't hit the set-state-in-effect concern the mount effect does.
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
        const [data, banned] = await Promise.all([
          apiClient.get<FriendsListResponse>('/friends'),
          apiClient.get<BannedUserView[]>('/rooms/banned'),
        ]);
        if (!cancelled) {
          setOverview(data);
          setBannedIds(new Set(banned.map((b) => b.userId)));
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

  const toggleBan = async (userId: string) => {
    setActionBusy(true);
    try {
      if (bannedIds.has(userId)) {
        await apiClient.delete(`/rooms/banned/${userId}`);
        setBannedIds((ids) => {
          const next = new Set(ids);
          next.delete(userId);
          return next;
        });
      } else {
        await apiClient.post('/rooms/banned', { userId });
        setBannedIds((ids) => new Set(ids).add(userId));
      }
      setActionSheetFor(null);
    } finally {
      setActionBusy(false);
    }
  };

  const openChallenge = (friendId: string) => {
    setChallengingFriendId(friendId);
    setChallengeQuestionCount(DUEL_QUESTION_COUNT_DEFAULT);
    setChallengeError(null);
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
      onChallengeSent(res.sessionId);
    } catch (err) {
      setChallengeError(err instanceof ApiError ? err.message : 'Не удалось отправить вызов');
      setChallengeSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">Найти по нику</span>
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
                <button
                  onClick={() =>
                    setActionSheetFor({
                      userId: result.userId,
                      nickname: result.nickname,
                      isFriend: result.relation === 'friend',
                    })
                  }
                  className="min-w-0 text-left"
                >
                  <p className="truncate text-sm font-semibold">{result.nickname}</p>
                  <p className="text-xs text-text-muted">
                    {result.title} · ур. {result.level}
                  </p>
                </button>
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

      {!overview ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : overview.friends.length === 0 ? (
        <p className="pt-4 text-center text-sm text-text-secondary">
          {emptyMessage ?? 'Пока нет друзей — найдите кого-нибудь по нику выше.'}
        </p>
      ) : (
        <Card className="flex-col gap-3">
          {overview.friends.map((friend) => (
            <div key={friend.userId} className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() =>
                    setActionSheetFor({
                      userId: friend.userId,
                      nickname: friend.nickname,
                      isFriend: true,
                    })
                  }
                  className="flex min-w-0 items-center gap-2 text-left"
                >
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
                </button>
                <div className="flex shrink-0 items-center gap-3">
                  {friend.online && (
                    <button
                      onClick={() => openChallenge(friend.userId)}
                      className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-on-primary"
                    >
                      Вызвать
                    </button>
                  )}
                  {renderFriendExtra?.(friend)}
                </div>
              </div>

              {challengingFriendId === friend.userId && (
                <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-hover p-3">
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
                      disabled={challengeSending}
                      className="h-10 rounded-lg bg-surface px-3 text-sm text-text-secondary disabled:opacity-50"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      {actionSheetFor && (
        <UserActionSheet
          nickname={actionSheetFor.nickname}
          isBanned={bannedIds.has(actionSheetFor.userId)}
          busy={actionBusy}
          onClose={() => setActionSheetFor(null)}
          onMessage={
            actionSheetFor.isFriend
              ? () => {
                  openThread(actionSheetFor.userId, actionSheetFor.nickname);
                  setActionSheetFor(null);
                }
              : undefined
          }
          onAddFriend={
            actionSheetFor.isFriend
              ? undefined
              : () => void sendRequest(actionSheetFor.userId).then(() => setActionSheetFor(null))
          }
          onToggleBan={() => void toggleBan(actionSheetFor.userId)}
        />
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
