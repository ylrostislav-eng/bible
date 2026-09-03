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

/** What a finished game reports about the daily streak. Every mode — solo,
 * duel, room, chapter check — returns this same shape, so a result screen
 * doesn't have to know which one it came from. */
export interface StreakSummary {
  current: number;
  longest: number;
  /** True only when this game was the first one today — i.e. it's what moved
   * the streak. Result screens celebrate on this, not on `current`. */
  increased: boolean;
  /** The player's chosen streak-goal target, or null if none set. */
  goalDays: number | null;
  /** True only on the game that pushed `current` across `goalDays` for the
   * first time; `goalCoinsEarned` came with this result. */
  goalReachedNow: boolean;
  goalCoinsEarned: number;
}
