'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type ActiveGameType = 'duel' | 'room';

export interface ActiveGame {
  type: ActiveGameType;
  sessionId: string;
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
      (parsed.type === 'duel' || parsed.type === 'room') &&
      typeof parsed.sessionId === 'string'
    ) {
      return { type: parsed.type, sessionId: parsed.sessionId };
    }
  } catch {
    // Malformed storage — treat as if nothing were stored.
  }
  return null;
}

/**
 * Tracks the one duel or room currently in progress, if any, and persists
 * it to `sessionStorage` so navigating away (or reloading the tab) and
 * coming back to `/play/duel` or `/play/room` reconnects automatically
 * instead of dropping back to the create/join menu. Also drives the
 * "Играть" nav tab redirect and badge (`BottomNav`) and gates the global
 * incoming-challenge popup (no point interrupting a game already running).
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
