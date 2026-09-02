'use client';

import { useEffect } from 'react';
import { useDeclineNotices } from '@/lib/decline-notices-context';

const AUTO_DISMISS_MS = 5000;

/**
 * A brief, non-blocking toast for "your invite was declined" notices.
 * Unlike the duel-challenge/room-invite popups, this never blocks the
 * screen — there's nothing left to decide, only something to know — so it
 * sits near the top, auto-dismisses on its own, and can be tapped away
 * sooner. Shows one at a time; the rest wait their turn (see
 * `DeclineNoticesProvider`).
 */
export function DeclineNoticeToast() {
  const { notices, dismiss } = useDeclineNotices();
  const notice = notices[0];

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = setTimeout(() => dismiss(notice.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timeout);
  }, [notice, dismiss]);

  if (!notice) return null;

  const nickname = notice.declinedByNickname ?? 'игрока';
  const message =
    notice.kind === 'DUEL_CHALLENGE'
      ? `Ваш вызов на дуэль к ${nickname} отклонён`
      : `Приглашение в «${notice.roomName ?? 'комнату'}» для ${nickname} отклонено`;

  return (
    <div className="pt-safe fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-3">
      <button
        onClick={() => dismiss(notice.id)}
        className="w-full max-w-sm rounded-xl border border-border bg-surface px-4 py-3 text-left text-sm shadow-lg"
      >
        {message}
      </button>
    </div>
  );
}
