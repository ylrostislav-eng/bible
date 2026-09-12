'use client';

import type { PendingDiceInvite } from '@bible-arena/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useActiveGame } from './active-game-context';
import { apiClient } from './api';

const POLL_MS = 4000;

interface IncomingDiceChallengesContextValue {
  challenges: PendingDiceInvite[];
  /** Прошёл ли хотя бы один опрос — как у `useIncomingChallenges`: до
   * первого ответа сервера пустой список значит «ещё не знаем», а не
   * «приглашений нет». */
  loaded: boolean;
  removeChallenge: (matchId: string) => void;
}

const IncomingDiceChallengesContext = createContext<IncomingDiceChallengesContextValue | null>(
  null,
);

/**
 * Личные вызовы в «Кости» — опрашиваются по всему приложению, а не только
 * на экране «Кого пригласить?».
 *
 * Раньше список приглашений жил внутри `play/dice/page.tsx` и был виден,
 * только пока сам экран открыт: закрытая на экран «Кости» партия — и
 * вызов от друга ждал бы там, куда никто не смотрит. Задача #1 в трекере
 * требовала ровно этого — глобального попапа, как `IncomingChallengeModal`
 * у дуэли, — и здесь тот же самый приём: контекст сам ходит на сервер,
 * а экран костей и попап читают один и тот же список, вместо двух
 * параллельных опросов одного адреса.
 *
 * Пауза — по тому же правилу, что и у дуэли: партия в разгаре (`IN_PROGRESS`)
 * не должна прерываться чужим приглашением, а стол, который просто ждёт
 * соперника, — не в счёт.
 */
export function IncomingDiceChallengesProvider({ children }: { children: React.ReactNode }) {
  const { activeGame } = useActiveGame();
  const [challenges, setChallenges] = useState<PendingDiceInvite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const busy = activeGame?.status === 'IN_PROGRESS';

  useEffect(() => {
    if (busy) return undefined;
    let cancelled = false;

    const poll = async () => {
      try {
        const list = await apiClient.get<PendingDiceInvite[]>('/dice/pending-invites');
        if (!cancelled) {
          setChallenges(list);
          setLoaded(true);
        }
      } catch {
        // Кратковременный сбой опроса игнорируется — следующий тик повторит.
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [busy]);

  const removeChallenge = useCallback((matchId: string) => {
    setChallenges((items) => items.filter((c) => c.matchId !== matchId));
  }, []);

  const value = useMemo(
    () => ({ challenges, loaded, removeChallenge }),
    [challenges, loaded, removeChallenge],
  );

  return (
    <IncomingDiceChallengesContext.Provider value={value}>
      {children}
    </IncomingDiceChallengesContext.Provider>
  );
}

export function useIncomingDiceChallenges(): IncomingDiceChallengesContextValue {
  const ctx = useContext(IncomingDiceChallengesContext);
  if (!ctx) {
    throw new Error('useIncomingDiceChallenges must be used within IncomingDiceChallengesProvider');
  }
  return ctx;
}
