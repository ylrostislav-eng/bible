'use client';

import type { DeclineNoticeView } from '@bible-arena/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useActiveGame } from './active-game-context';
import { apiClient } from './api';

const POLL_MS = 4000;

interface DeclineNoticesContextValue {
  notices: DeclineNoticeView[];
  dismiss: (id: string) => void;
}

const DeclineNoticesContext = createContext<DeclineNoticesContextValue | null>(null);

/**
 * Polls for "your invite was declined" notices app-wide — the sender-side
 * counterpart to `IncomingChallengesProvider`/`IncomingRoomInvitesProvider`.
 * Declining a duel challenge or room invite used to just make it quietly
 * disappear for whoever sent it; this is what tells them what happened.
 * Paused mid-game for the same reason the other two are: nothing should be
 * popping up over active gameplay.
 */
export function DeclineNoticesProvider({ children }: { children: React.ReactNode }) {
  const { activeGame } = useActiveGame();
  const [notices, setNotices] = useState<DeclineNoticeView[]>([]);
  const busy = activeGame?.status === 'IN_PROGRESS';

  useEffect(() => {
    if (busy) return undefined;
    let cancelled = false;

    const poll = async () => {
      try {
        const list = await apiClient.get<DeclineNoticeView[]>('/notifications/decline-notices');
        if (!cancelled) setNotices(list);
      } catch {
        // Transient poll failures are ignored — the next tick will retry.
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [busy]);

  // Removes it locally right away (so the toast doesn't hang around for a
  // whole extra poll tick) and tells the server so it isn't shown again —
  // this table only ever holds undelivered notices, so "dismiss" really
  // does mean "delete", not just "mark read".
  const dismiss = useCallback((id: string) => {
    setNotices((ns) => ns.filter((n) => n.id !== id));
    void apiClient.delete(`/notifications/decline-notices/${id}`).catch(() => {
      // Worst case it shows up again on the next poll — harmless.
    });
  }, []);

  const value = useMemo(() => ({ notices, dismiss }), [notices, dismiss]);

  return <DeclineNoticesContext.Provider value={value}>{children}</DeclineNoticesContext.Provider>;
}

export function useDeclineNotices(): DeclineNoticesContextValue {
  const ctx = useContext(DeclineNoticesContext);
  if (!ctx) {
    throw new Error('useDeclineNotices must be used within DeclineNoticesProvider');
  }
  return ctx;
}
