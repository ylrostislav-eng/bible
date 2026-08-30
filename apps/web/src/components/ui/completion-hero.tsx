'use client';

import { useState } from 'react';
import { pickEncouragement } from '@/lib/encouragement';
import { OilLampFlame } from './oil-lamp-flame';

interface CompletionHeroProps {
  correctCount: number;
  totalQuestions: number;
}

/** Flame mascot + a randomly-picked encouragement line, shown atop a
 * completion screen (solo game, duel, chapter check) instead of a flat
 * "Game over" heading. The phrase is picked once per mount, not re-rolled
 * on every re-render. */
export function CompletionHero({ correctCount, totalQuestions }: CompletionHeroProps) {
  const percent = totalQuestions > 0 ? correctCount / totalQuestions : 0;
  const [phrase] = useState(() => pickEncouragement(percent));

  return (
    <div className="flex flex-col items-center gap-3">
      <OilLampFlame size={96} />
      <h1 className="text-2xl font-bold text-text-primary text-balance">{phrase}</h1>
    </div>
  );
}
