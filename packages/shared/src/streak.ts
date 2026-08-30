export const STREAK_GOAL_OPTIONS = [7, 14, 30, 50] as const;
export type StreakGoalDays = (typeof STREAK_GOAL_OPTIONS)[number];

/** One-time coin reward for reaching a streak goal — scaled to this app's
 * economy (a perfect chapter check earns a few coins), not Duolingo's gems. */
export const STREAK_GOAL_COIN_REWARD: Record<StreakGoalDays, number> = {
  7: 20,
  14: 50,
  30: 120,
  50: 250,
};

export interface SetStreakGoalInput {
  days: StreakGoalDays;
}
