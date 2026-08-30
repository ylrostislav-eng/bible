'use client';

import {
  STREAK_GOAL_COIN_REWARD,
  STREAK_GOAL_OPTIONS,
  type StreakGoalDays,
} from '@bible-arena/shared';
import clsx from 'clsx';
import { Card } from './card';
import { OilLampFlame } from './oil-lamp-flame';

const WEEKDAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function buildWeekStrip(currentStreak: number): { label: string; done: boolean }[] {
  const today = new Date();
  const cells: { label: string; done: boolean }[] = [];
  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    cells.push({
      label: WEEKDAY_LABELS[d.getDay()],
      done: daysAgo < Math.min(currentStreak, 7),
    });
  }
  return cells;
}

interface StreakSectionProps {
  current: number;
  longest: number;
  goalDays: number | null;
  goalRewarded: boolean;
  goalReachedNow: boolean;
  goalCoinsEarned: number;
  onSetGoal: (days: StreakGoalDays) => void;
  settingGoal: boolean;
}

/** The streak "hero" section on a chapter-check summary: flame, current
 * streak, a week strip, and — depending on state — either a prompt to pick
 * a streak goal, progress toward one already set, or a reward highlight
 * for the check that just reached it. */
export function StreakSection({
  current,
  longest,
  goalDays,
  goalRewarded,
  goalReachedNow,
  goalCoinsEarned,
  onSetGoal,
  settingGoal,
}: StreakSectionProps) {
  const week = buildWeekStrip(current);
  const daysToGoal = goalDays !== null ? goalDays - current : null;

  return (
    <Card className="flex-col items-center gap-3">
      <OilLampFlame size={56} />
      <div className="flex flex-col items-center">
        <p className="text-3xl font-bold text-primary">{current}</p>
        <p className="text-sm text-text-secondary">
          {current === 1 ? 'день подряд' : 'дней подряд'}
        </p>
        {longest > current && <p className="text-xs text-text-muted">Рекорд: {longest}</p>}
      </div>

      <div className="flex gap-1.5">
        {week.map((day, i) => (
          <div
            key={i}
            className={clsx(
              'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold',
              day.done
                ? 'bg-primary text-on-primary'
                : 'border border-border bg-surface-hover text-text-muted',
            )}
          >
            {day.label}
          </div>
        ))}
      </div>

      {goalReachedNow && (
        <div className="w-full rounded-xl border border-primary bg-primary/10 px-3 py-2 text-center">
          <p className="text-sm font-semibold text-primary">
            Цель по серии {goalDays} дней достигнута — +{goalCoinsEarned} монет!
          </p>
        </div>
      )}

      {!goalReachedNow &&
        goalDays !== null &&
        !goalRewarded &&
        daysToGoal !== null &&
        daysToGoal > 0 && (
          <p className="text-xs text-text-muted">
            Ещё {daysToGoal} {daysToGoal === 1 ? 'день' : 'дней'} до цели «{goalDays} дней» — +
            {STREAK_GOAL_COIN_REWARD[goalDays as StreakGoalDays]} монет
          </p>
        )}

      {goalDays === null && (
        <div className="flex w-full flex-col items-center gap-2 border-t border-border pt-3">
          <p className="text-xs text-text-secondary">Поставь цель по серии — получишь монеты</p>
          <div className="grid w-full grid-cols-4 gap-2">
            {STREAK_GOAL_OPTIONS.map((days) => (
              <button
                key={days}
                onClick={() => onSetGoal(days)}
                disabled={settingGoal}
                className="flex flex-col items-center rounded-lg border border-border bg-surface-hover px-1 py-2 text-center transition hover:border-primary disabled:opacity-50"
              >
                <span className="text-sm font-bold text-text-primary">{days}</span>
                <span className="text-[10px] text-text-muted">
                  +{STREAK_GOAL_COIN_REWARD[days]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
