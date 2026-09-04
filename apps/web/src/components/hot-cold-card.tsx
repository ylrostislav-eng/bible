'use client';

import { hotColdAttemptsLabel, type HotColdState } from '@bible-arena/shared';
import clsx from 'clsx';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

/**
 * «Горячо-холодно» на главной, рядом со словом дня.
 *
 * Обе игры про сегодня и обе на минуту, но заходы разные: в слове дня пять
 * попыток и описание, здесь попыток сколько угодно и подсказывает только
 * расстояние. Кому-то ближе одно, кому-то другое, и выбирать за человека
 * незачем.
 *
 * Карточка молча исчезает, если запрос не удался: пустое место лучше, чем
 * ошибка на главном экране из-за необязательной вещи.
 */
export function HotColdCard() {
  const [state, setState] = useState<HotColdState | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<HotColdState>('/hot-cold')
      .then((response) => {
        if (!cancelled) setState(response);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return null;

  const done = state?.finished ?? false;
  const best = state?.guesses[0] ?? null;
  const tries = state?.guesses.filter((entry) => !entry.revealed).length ?? 0;

  return (
    <Link href="/hot-cold">
      <div
        className={clsx(
          'flex items-center gap-4 rounded-2xl border p-4 transition',
          done ? 'border-border bg-surface' : 'border-warning/40 bg-warning/5',
        )}
      >
        <span
          className={clsx(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl',
            done ? 'bg-surface-hover' : 'bg-warning/15',
          )}
          aria-hidden
        >
          {done ? '✓' : '🌡'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Горячо-холодно</p>
          <p className="truncate text-sm text-text-secondary">
            {!state
              ? 'Загружаем…'
              : done
                ? `Угадано за ${hotColdAttemptsLabel(tries)}${state.earned ? ` · +${state.earned.xp} XP` : ''}`
                : best
                  ? `Лучшее место: ${best.rank} · ${hotColdAttemptsLabel(tries)}`
                  : 'Пишите любые слова — игра скажет, насколько близко'}
          </p>
        </div>
        {!done && state && (
          <span className="shrink-0 text-sm font-semibold text-warning">
            {state.rewardIfSolvedNow.xp} XP
          </span>
        )}
      </div>
    </Link>
  );
}
