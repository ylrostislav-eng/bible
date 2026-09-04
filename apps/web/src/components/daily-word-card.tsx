'use client';

import type { DailyWordState } from '@bible-arena/shared';
import clsx from 'clsx';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

/**
 * Слово дня на главной.
 *
 * Стоит здесь, а не в меню «Играть», потому что это не режим игры, а повод
 * открыть приложение: минута, одно слово, и оно сегодня одно на всех. В
 * списке режимов его бы находили те, кто и так пришёл играть, — то есть
 * ровно не те, ради кого оно сделано.
 *
 * Карточка молча исчезает, если запрос не удался: пустое место лучше, чем
 * ошибка на главном экране из-за необязательной вещи.
 */
export function DailyWordCard() {
  const [state, setState] = useState<DailyWordState | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<DailyWordState>('/daily-word')
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
  const solved = state?.solved ?? false;

  return (
    <Link href="/daily">
      <div
        className={clsx(
          'flex items-center gap-4 rounded-2xl border p-4 transition',
          done ? 'border-border bg-surface' : 'border-primary/40 bg-primary/5',
        )}
      >
        <span
          className={clsx(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl',
            done ? 'bg-surface-hover' : 'bg-primary/15',
          )}
          aria-hidden
        >
          {done ? (solved ? '✓' : '·') : '?'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Слово дня</p>
          <p className="truncate text-sm text-text-secondary">
            {!state
              ? 'Загружаем…'
              : done
                ? solved
                  ? `Угадано${state.earned ? ` · +${state.earned.xp} XP` : ''}`
                  : 'Сегодня не поддалось — посмотреть ответ'
                : state.attemptsUsed > 0
                  ? `Осталось ${state.attemptsLeft} из ${state.attemptsUsed + state.attemptsLeft}`
                  : 'Одно слово на всех. Угадайте по описанию'}
          </p>
        </div>
        {!done && state && (
          <span className="shrink-0 text-sm font-semibold text-primary">
            {state.rewardIfSolvedNow.xp} XP
          </span>
        )}
      </div>
    </Link>
  );
}
