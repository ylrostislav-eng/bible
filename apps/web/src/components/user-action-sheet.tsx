'use client';

import { useState } from 'react';
import { ReportSheet } from './report-sheet';

interface UserActionSheetProps {
  nickname: string | null;
  /** Needed for the report action — a complaint has to name someone. */
  userId: string;
  isBanned: boolean;
  busy?: boolean;
  onClose: () => void;
  /** Omitted entirely (not just disabled) when messaging isn't possible —
   * friends-only, so this is only passed when `isFriend` is true. */
  onMessage?: () => void;
  /** Omitted when already friends — nothing to add. */
  onAddFriend?: () => void;
  onToggleBan: () => void;
}

/**
 * Bottom-sheet action menu for tapping a player's name/avatar anywhere in
 * the app — message / add friend / ban-unban, the three actions the user
 * asked for ("написать сообщение, добавить в друзья, забанить, разбанить").
 * Deliberately takes the relation (`isFriend`/`isBanned`) as props instead of
 * fetching it itself — every caller embedding this already has that data
 * from its own friends/search list, so re-fetching per tap would just be
 * wasted round trips.
 */
export function UserActionSheet({
  nickname,
  userId,
  isBanned,
  busy,
  onClose,
  onMessage,
  onAddFriend,
  onToggleBan,
}: UserActionSheetProps) {
  const [reporting, setReporting] = useState(false);

  if (reporting) {
    return (
      <ReportSheet
        targetUserId={userId}
        targetNickname={nickname}
        onClose={() => {
          setReporting(false);
          onClose();
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="truncate text-base font-bold">{nickname ?? 'Игрок'}</p>
          <button onClick={onClose} className="text-sm text-text-secondary">
            Закрыть
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {onMessage && (
            <button
              onClick={onMessage}
              disabled={busy}
              className="h-12 rounded-xl bg-primary text-sm font-semibold text-on-primary disabled:opacity-50"
            >
              Написать сообщение
            </button>
          )}
          {onAddFriend && (
            <button
              onClick={onAddFriend}
              disabled={busy}
              className="h-12 rounded-xl bg-surface-hover text-sm font-semibold text-text-primary disabled:opacity-50"
            >
              Добавить в друзья
            </button>
          )}
          <button
            onClick={onToggleBan}
            disabled={busy}
            className="h-12 rounded-xl bg-surface-hover text-sm font-semibold text-danger disabled:opacity-50"
          >
            {isBanned ? 'Разбанить' : 'Забанить'}
          </button>
          {/* Separate from "Забанить" on purpose: banning hides someone from
              you, reporting tells someone who can actually stop them. A
              player who only bans thinks they've dealt with it. */}
          <button
            onClick={() => setReporting(true)}
            disabled={busy}
            className="h-12 rounded-xl text-sm font-medium text-text-secondary disabled:opacity-50"
          >
            Пожаловаться
          </button>
        </div>
      </div>
    </div>
  );
}
