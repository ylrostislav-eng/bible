'use client';

import { TEXT_SCALE_FACTORS } from '@bible-arena/shared';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';

/**
 * Applies the player's text-size setting to the whole app.
 *
 * Scales the root font size rather than restyling individual screens: the
 * layout is built in `rem`-derived Tailwind units, so one variable moves
 * headings, body text and — most importantly — the answer buttons
 * together. Someone who needs bigger text needs it where they tap, not
 * only where they read.
 *
 * Applied to `documentElement` (not a wrapper div) because full-screen
 * modals render outside the app's own tree.
 */
export function TextScaleProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const scale = TEXT_SCALE_FACTORS[user?.textScale ?? 'NORMAL'];

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.fontSize;
    root.style.fontSize = scale === 1 ? '' : `${(16 * scale).toFixed(1)}px`;
    return () => {
      root.style.fontSize = previous;
    };
  }, [scale]);

  return <>{children}</>;
}
