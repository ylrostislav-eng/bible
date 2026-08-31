'use client';

import type { PendingChallenge } from '@bible-arena/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useActiveGame } from './active-game-context';
import { apiClient } from './api';

const POLL_MS = 4000;

interface IncomingChallengesContextValue {
  challenges: PendingChallenge[];
  removeChallenge: (sessionId: string) => void;
}

const IncomingChallengesContext = createContext<IncomingChallengesContextValue | null>(null);

/**
 * Polls friend-duel challenges app-wide (not just while sitting on the duel
 * screen), so `IncomingChallengeModal` can surface a new one no matter where
 * the user currently is. Paused entirely while a duel or room is already in
 * progress — there's nothing useful to do with a challenge until that ends.
 */
export function IncomingChallengesProvider({ children }: { children: React.ReactNode }) {
  const { activeGame } = useActiveGame();
  const [challenges, setChallenges] = useState<PendingChallenge[]>([]);

  useEffect(() => {
    if (activeGame) return undefined;
    let cancelled = false;

    const poll = async () => {
      try {
        const list = await apiClient.get<PendingChallenge[]>('/game/duel/pending-challenges');
        if (!cancelled) setChallenges(list);
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
  }, [activeGame]);

  const removeChallenge = useCallback((sessionId: string) => {
    setChallenges((cs) => cs.filter((c) => c.sessionId !== sessionId));
  }, []);

  const value = useMemo(() => ({ challenges, removeChallenge }), [challenges, removeChallenge]);

  return (
    <IncomingChallengesContext.Provider value={value}>
      {children}
    </IncomingChallengesContext.Provider>
  );
}

export function useIncomingChallenges(): IncomingChallengesContextValue {
  const ctx = useContext(IncomingChallengesContext);
  if (!ctx) {
    throw new Error('useIncomingChallenges must be used within IncomingChallengesProvider');
  }
  return ctx;
}
