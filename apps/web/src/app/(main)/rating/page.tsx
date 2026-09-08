'use client';

import type { BannedUserView, LeaderboardEntry, LeaderboardResponse } from '@bible-arena/shared';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { RatingIcon } from '@/components/icons/nav-icons';
import { PlayerLabel, RoleOrTitle } from '@/components/ui/player-label';
import { Card } from '@/components/ui/card';
import { ScreenIcon } from '@/components/ui/screen-icon';
import { UserActionSheet } from '@/components/user-action-sheet';
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

function Row({
  entry,
  requestSent,
  onOpen,
}: {
  entry: LeaderboardEntry;
  /** Заявку отправили прямо сейчас, не перезагружая список. */
  requestSent: boolean;
  onOpen: (() => void) | null;
}) {
  const content = (
    <>
      <span className="w-6 shrink-0 text-center text-sm font-bold text-text-secondary">
        {entry.rank}
      </span>
      <Avatar entry={entry} />
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-semibold">
          <PlayerLabel nickname={entry.nickname} role={entry.role} />
        </p>
        <p className="flex items-center gap-1.5 truncate text-xs text-text-secondary">
          <RoleOrTitle nickname={entry.nickname} role={entry.role} title={entry.title} /> ·{' '}
          {entry.gamesWon}W/
          {entry.gamesLost}L
        </p>
      </div>
      {requestSent && <span className="shrink-0 text-xs text-text-muted">Заявка отправлена</span>}
      <span className="shrink-0 text-sm font-bold text-primary">{entry.rating}</span>
    </>
  );

  const className = clsx(
    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition',
    entry.isMe && 'border border-primary bg-primary/10',
    onOpen && 'hover:bg-surface-hover active:bg-surface-hover',
  );

  // Строка нажимается только тогда, когда за нажатием что-то есть.
  // Кликабельная строка, которая молча ничего не делает, читается как
  // поломка — а таких строк здесь большинство: свои, друзья, все, кому
  // нельзя написать (см. `canAddFriend`).
  if (!onOpen) return <div className={className}>{content}</div>;

  return (
    <button type="button" onClick={onOpen} className={className}>
      {content}
    </button>
  );
}

export default function RatingPage() {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [bannedIds, setBannedIds] = useState<Set<string>>(new Set());
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [openFor, setOpenFor] = useState<LeaderboardEntry | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Чёрный список нужен карточке игрока, чтобы показать «Заблокировать»
        // или «Разблокировать» — иначе кнопка врёт про текущее состояние.
        // `allSettled`, потому что рейтинг ради него терять нельзя.
        const [board, banned] = await Promise.allSettled([
          apiClient.get<LeaderboardResponse>('/users/leaderboard'),
          apiClient.get<BannedUserView[]>('/rooms/banned'),
        ]);
        if (cancelled) return;
        if (banned.status === 'fulfilled') {
          setBannedIds(new Set(banned.value.map((b) => b.userId)));
        }
        if (board.status === 'rejected') throw board.reason;
        setData(board.value);
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

  const addFriend = async (userId: string) => {
    setActionBusy(true);
    try {
      await apiClient.post('/friends/requests', { toUserId: userId });
      setSentTo((ids) => new Set(ids).add(userId));
      setOpenFor(null);
    } catch (err) {
      // Причина бывает настоящая: пока экран был открыт, тот человек мог
      // сам прислать заявку или попасть в чёрный список. Молчать здесь
      // нельзя — иначе кнопка просто «не срабатывает».
      setError(err instanceof ApiError ? err.message : 'Не удалось отправить заявку');
      setOpenFor(null);
    } finally {
      setActionBusy(false);
    }
  };

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
      setOpenFor(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось изменить чёрный список');
      setOpenFor(null);
    } finally {
      setActionBusy(false);
    }
  };

  /** Есть ли смысл открывать карточку игрока по этой строке. */
  const openerFor = (entry: LeaderboardEntry) =>
    entry.isMe || (!entry.canAddFriend && !bannedIds.has(entry.id))
      ? null
      : () => setOpenFor(entry);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6">
      <div className="flex items-center gap-3">
        <ScreenIcon icon={RatingIcon} />
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
                <Row
                  key={entry.id}
                  entry={entry}
                  requestSent={sentTo.has(entry.id)}
                  onOpen={openerFor(entry)}
                />
              ))}
            </Card>
          )}

          {data.me && (
            <Card className="flex-col gap-1">
              <p className="px-1 text-xs font-semibold text-text-secondary">Ваше место</p>
              <Row entry={data.me} requestSent={false} onOpen={null} />
            </Card>
          )}
        </>
      )}

      {openFor && (
        <UserActionSheet
          nickname={openFor.nickname}
          userId={openFor.id}
          isBanned={bannedIds.has(openFor.id)}
          busy={actionBusy}
          onClose={() => setOpenFor(null)}
          // Писать можно только друзьям, а здесь по определению не друзья:
          // друзьям кнопка «добавить» не показывается вовсе.
          onAddFriend={
            openFor.canAddFriend && !sentTo.has(openFor.id)
              ? () => void addFriend(openFor.id)
              : undefined
          }
          onToggleBan={() => void toggleBan(openFor.id)}
        />
      )}
    </div>
  );
}
