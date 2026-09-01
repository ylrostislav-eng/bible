'use client';

import type { RoomInviteView } from '@bible-arena/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useActiveGame } from './active-game-context';
import { apiClient } from './api';

const POLL_MS = 4000;

interface IncomingRoomInvitesContextValue {
  invites: RoomInviteView[];
  removeInvite: (inviteId: string) => void;
}

const IncomingRoomInvitesContext = createContext<IncomingRoomInvitesContextValue | null>(null);

/**
 * Polls direct room invites app-wide (not just while sitting on the room
 * screen), so `IncomingRoomInviteModal` can surface a new one no matter
 * where the user currently is — mirrors `IncomingChallengesProvider`'s role
 * for duel challenges exactly, including pausing only while a game is
 * actually `IN_PROGRESS` (not merely open-but-not-started).
 */
export function IncomingRoomInvitesProvider({ children }: { children: React.ReactNode }) {
  const { activeGame } = useActiveGame();
  const [invites, setInvites] = useState<RoomInviteView[]>([]);
  const busy = activeGame?.status === 'IN_PROGRESS';

  useEffect(() => {
    if (busy) return undefined;
    let cancelled = false;

    const poll = async () => {
      try {
        const list = await apiClient.get<RoomInviteView[]>('/rooms/invites/pending');
        if (!cancelled) setInvites(list);
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

  const removeInvite = useCallback((inviteId: string) => {
    setInvites((is) => is.filter((i) => i.inviteId !== inviteId));
  }, []);

  const value = useMemo(() => ({ invites, removeInvite }), [invites, removeInvite]);

  return (
    <IncomingRoomInvitesContext.Provider value={value}>
      {children}
    </IncomingRoomInvitesContext.Provider>
  );
}

export function useIncomingRoomInvites(): IncomingRoomInvitesContextValue {
  const ctx = useContext(IncomingRoomInvitesContext);
  if (!ctx) {
    throw new Error('useIncomingRoomInvites must be used within IncomingRoomInvitesProvider');
  }
  return ctx;
}
