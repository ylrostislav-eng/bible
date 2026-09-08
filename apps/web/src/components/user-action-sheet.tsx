'use client';

import { useState } from 'react';
import type { AppRole } from '@bible-arena/shared';
import { ReportSheet } from './report-sheet';
import { PlayerLabel } from './ui/player-label';

interface UserActionSheetProps {
  nickname: string | null;
  /** Роль: у скрывшего имя в заголовке стоит значок вместо ника. */
  role?: AppRole | null;
  /** Needed for the report action — a complaint has to name someone. */
  userId: string;
  isBanned: boolean;
  busy?: boolean;
  onClose: () => void;
  /** Omitted when already friends — nothing to add. */
  onAddFriend?: () => void;
  onToggleBan: () => void;
}

/**
 * Меню действий по нажатию на имя игрока: добавить в друзья,
 * заблокировать/разблокировать, пожаловаться.
 *
 * «Написать сообщение» отсюда убрано вместе с личной перепиской: писать
 * друг другу произвольный текст в приложении больше нельзя, остались
 * приглашения в игры и вызовы.
 * Deliberately takes the relation (`isFriend`/`isBanned`) as props instead of
 * fetching it itself — every caller embedding this already has that data
 * from its own friends/search list, so re-fetching per tap would just be
 * wasted round trips.
 */
export function UserActionSheet({
  nickname,
  role,
  userId,
  isBanned,
  busy,
  onClose,
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
          <p className="truncate text-base font-bold">
            <PlayerLabel nickname={nickname} role={role} badgeSize="md" />
          </p>
          <button onClick={onClose} className="text-sm text-text-secondary">
            Закрыть
          </button>
        </div>
        <div className="flex flex-col gap-2">
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
