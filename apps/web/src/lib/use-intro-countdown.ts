'use client';

import { useEffect, useState } from 'react';

/**
 * Drives the shared pre-match "3, 2, 1, Поехали!" countdown (duel and room
 * screens both use it) — `null` hides it, `0` is the "Поехали!" beat,
 * otherwise the number itself.
 *
 * Shown exactly once per session, tracked via `sessionStorage` rather than
 * a `useRef`: navigating away mid-countdown (tapping "Главная" and coming
 * back, say) fully unmounts and remounts the page, wiping any in-memory
 * ref — so the old ref-based guard saw a fresh `null` on return and replayed
 * the countdown from the top. `sessionStorage` survives the remount, so
 * "already shown for this session" sticks for as long as the tab does.
 */
export function useIntroCountdown(params: {
  sessionId: string | null;
  /** e.g. `status === 'IN_PROGRESS' && questionNumber === 1` */
  active: boolean;
  /** Unique per screen (duel vs. room) so the two don't collide. */
  storageKey: string;
  stepMs: number;
}): number | null {
  const { sessionId, active, storageKey, stepMs } = params;
  const [introStep, setIntroStep] = useState<number | null>(null);

  useEffect(() => {
    function maybeStartIntro() {
      if (!sessionId || !active) return;
      // sessionStorage can throw in some private-browsing contexts — treat
      // that the same as "never shown" rather than crashing the screen over
      // a cosmetic countdown.
      let shownFor: string | null = null;
      try {
        shownFor = sessionStorage.getItem(storageKey);
      } catch {
        // ignore
      }
      if (shownFor === sessionId) return;
      try {
        sessionStorage.setItem(storageKey, sessionId);
      } catch {
        // Worst case (storage unavailable) the countdown can replay once —
        // still better than crashing.
      }
      setIntroStep(3);
    }
    maybeStartIntro();
  }, [sessionId, active, storageKey]);

  useEffect(() => {
    if (introStep === null) return undefined;
    const timeout = setTimeout(() => {
      setIntroStep((step) => (step === null || step === 0 ? null : step - 1));
    }, stepMs);
    return () => clearTimeout(timeout);
  }, [introStep, stepMs]);

  return introStep;
}
