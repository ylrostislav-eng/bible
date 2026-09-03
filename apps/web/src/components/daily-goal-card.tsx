'use client';

import {
  STREAK_GOAL_COIN_REWARD,
  type StreakGoalDays,
  type UserProfile,
} from '@bible-arena/shared';
import clsx from 'clsx';
import Link from 'next/link';
import { pluralCoins, pluralDays } from '@/lib/plural';
import { buildStreakWeek } from '@/lib/streak-week';
import { Card } from './ui/card';
import { OilLampFlame } from './ui/oil-lamp-flame';

/**
 * The home screen's answer to "what am I here for today".
 *
 * The daily goal is deliberately one game of any kind, because that's
 * exactly what the streak now counts — a goal that doesn't match the rule
 * it's measured by is worse than no goal at all. Everything else on this
 * card exists to make today's state readable at a glance: whether the day
 * is already safe, and how far the week has come.
 */
export function DailyGoalCard({ user }: { user: UserProfile }) {
  const week = buildStreakWeek(user.currentStreak, user.streakActiveToday);
  const goalDays = user.streakGoalDays;
  const daysToGoal = goalDays !== null ? goalDays - user.currentStreak : null;

  return (
    <Card className="flex-col gap-3">
      <div className="flex items-center gap-3">
        <OilLampFlame size={36} glow={user.streakActiveToday} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {user.currentStreak > 0
              ? `${user.currentStreak} ${pluralDays(user.currentStreak)} подряд`
              : 'Серия ещё не начата'}
          </p>
          <p
            className={clsx(
              'text-xs',
              user.streakActiveToday ? 'text-success' : 'text-text-secondary',
            )}
          >
            {user.streakActiveToday
              ? 'Сегодня сыграно — серия в силе'
              : 'Одна игра сегодня — и серия продолжится'}
          </p>
        </div>
        {user.longestStreak > user.currentStreak && (
          <div className="shrink-0 text-right">
            <p className="text-[10px] text-text-secondary">Рекорд</p>
            <p className="text-sm font-semibold">{user.longestStreak}</p>
          </div>
        )}
      </div>

      <div className="flex justify-between gap-1.5">
        {week.map((day, i) => (
          <div
            key={i}
            className={clsx(
              'flex h-8 flex-1 items-center justify-center rounded-lg text-[11px] font-semibold',
              day.done
                ? 'bg-primary text-on-primary'
                : 'border border-border bg-surface-hover text-text-secondary',
              // Today gets a ring rather than a fill, so "which day is it"
              // and "is it done" stay two separate readings.
              day.isToday && !day.done && 'border-primary text-primary',
            )}
          >
            {day.label}
          </div>
        ))}
      </div>

      {!user.streakActiveToday && (
        <Link
          href="/play"
          className="flex h-11 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-on-primary transition active:scale-[0.98]"
        >
          Играть
        </Link>
      )}

      {goalDays !== null && !user.streakGoalRewarded && daysToGoal !== null && daysToGoal > 0 && (
        <p className="text-xs text-text-secondary">
          Ещё {daysToGoal} {pluralDays(daysToGoal)} до цели «{goalDays} {pluralDays(goalDays)}» — +
          {STREAK_GOAL_COIN_REWARD[goalDays as StreakGoalDays]}{' '}
          {pluralCoins(STREAK_GOAL_COIN_REWARD[goalDays as StreakGoalDays])}
        </p>
      )}
    </Card>
  );
}
