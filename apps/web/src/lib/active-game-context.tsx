'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

/** `alias` — партия за одним телефоном. Она попадает сюда не ради
 * переподключения (партия целиком на устройстве и никуда не девается), а
 * ради двух побочных эффектов: вкладка «Играть» возвращает в неё, а входящие
 * вызовы и приглашения не всплывают посреди раунда. */
export type ActiveGameType = 'duel' | 'room' | 'alias';

export interface ActiveGame {
  type: ActiveGameType;
  sessionId: string;
  /** The session's own status string (e.g. `'LOBBY'`, `'WAITING_FOR_OPPONENT'`,
   * `'IN_PROGRESS'`), kept in sync by whichever page owns the live
   * connection. Only `'IN_PROGRESS'` counts as "actually busy" — sitting in
   * a not-yet-started room/duel shouldn't block incoming duel challenges or
   * room invites from reaching you. Undefined until the owning page's first
   * state arrives. */
  status?: string;
}

const STORAGE_KEY = 'bible-arena:active-game';

interface ActiveGameContextValue {
  activeGame: ActiveGame | null;
  setActiveGame: (game: ActiveGame | null) => void;
}

const ActiveGameContext = createContext<ActiveGameContextValue | null>(null);

function readStored(): ActiveGame | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      'type' in parsed &&
      'sessionId' in parsed &&
      (parsed.type === 'duel' || parsed.type === 'room' || parsed.type === 'alias') &&
      typeof parsed.sessionId === 'string'
    ) {
      const status =
        'status' in parsed && typeof parsed.status === 'string' ? parsed.status : undefined;
      return { type: parsed.type, sessionId: parsed.sessionId, status };
    }
  } catch {
    // Malformed storage — treat as if nothing were stored.
  }
  return null;
}

/**
 * Tracks the one duel or room currently open (regardless of whether it's
 * actually started yet), if any, and persists it to `sessionStorage` so
 * navigating away (or reloading the tab) and coming back to `/play/duel` or
 * `/play/room` reconnects automatically instead of dropping back to the
 * create/join menu. Also drives the "Играть" nav tab redirect and badge
 * (`BottomNav`), and — via its `status` field — gates the global
 * incoming-challenge/invite popups: only `status === 'IN_PROGRESS'` counts
 * as busy, so sitting in a not-yet-started room or an unanswered duel
 * invite doesn't silently swallow other incoming challenges/invites.
 */
export function ActiveGameProvider({ children }: { children: React.ReactNode }) {
  const [activeGame, setActiveGameState] = useState<ActiveGame | null>(readStored);

  const setActiveGame = useCallback((game: ActiveGame | null) => {
    setActiveGameState(game);
    try {
      if (game) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(game));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Best-effort — a failed write just means it won't survive a reload.
    }
  }, []);

  const value = useMemo(() => ({ activeGame, setActiveGame }), [activeGame, setActiveGame]);

  return <ActiveGameContext.Provider value={value}>{children}</ActiveGameContext.Provider>;
}

export function useActiveGame(): ActiveGameContextValue {
  const ctx = useContext(ActiveGameContext);
  if (!ctx) {
    throw new Error('useActiveGame must be used within ActiveGameProvider');
  }
  return ctx;
}
