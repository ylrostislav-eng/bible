'use client';

import type { PendingHotColdDuelInvite } from '@bible-arena/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useActiveGame } from './active-game-context';
import { apiClient } from './api';

const POLL_MS = 4000;

interface IncomingHotColdChallengesContextValue {
  challenges: PendingHotColdDuelInvite[];
  /** Прошёл ли хотя бы один опрос — до первого ответа сервера пустой
   * список значит «ещё не знаем», а не «приглашений нет». */
  loaded: boolean;
  removeChallenge: (duelId: string) => void;
}

const IncomingHotColdChallengesContext =
  createContext<IncomingHotColdChallengesContextValue | null>(null);

/**
 * Личные вызовы в «Горячо-холодно» — опрашиваются по всему приложению, а
 * не только на экране режима. Тот же приём, что и у «Костей»
 * (`incoming-dice-challenges-context.tsx`): контекст сам ходит на сервер, а
 * экран и глобальный попап читают один и тот же список, вместо двух
 * параллельных опросов одного адреса.
 *
 * Пауза — по тому же правилу, что у дуэли и костей: партия в разгаре
 * (`IN_PROGRESS`) не должна прерываться чужим приглашением, а стол, который
 * просто ждёт соперника или прошёл отсчёт готовности, — не в счёт.
 */
export function IncomingHotColdChallengesProvider({ children }: { children: React.ReactNode }) {
  const { activeGame } = useActiveGame();
  const [challenges, setChallenges] = useState<PendingHotColdDuelInvite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const busy = activeGame?.status === 'IN_PROGRESS';

  useEffect(() => {
    if (busy) return undefined;
    let cancelled = false;

    const poll = async () => {
      try {
        const list = await apiClient.get<PendingHotColdDuelInvite[]>(
          '/hot-cold/duel/pending-invites',
        );
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

  const removeChallenge = useCallback((duelId: string) => {
    setChallenges((items) => items.filter((c) => c.duelId !== duelId));
  }, []);

  const value = useMemo(
    () => ({ challenges, loaded, removeChallenge }),
    [challenges, loaded, removeChallenge],
  );

  return (
    <IncomingHotColdChallengesContext.Provider value={value}>
      {children}
    </IncomingHotColdChallengesContext.Provider>
  );
}

export function useIncomingHotColdChallenges(): IncomingHotColdChallengesContextValue {
  const ctx = useContext(IncomingHotColdChallengesContext);
  if (!ctx) {
    throw new Error(
      'useIncomingHotColdChallenges must be used within IncomingHotColdChallengesProvider',
    );
  }
  return ctx;
}
