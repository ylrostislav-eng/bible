import type { AgeBand } from './age';
import type { LanguageCode } from './language';

export const NICKNAME_MIN_LENGTH = 3;
export const NICKNAME_MAX_LENGTH = 20;
/** Letters (any script), digits, and underscores only. */
export const NICKNAME_PATTERN = /^[\p{L}0-9_]+$/u;

/** XP required per level; level = floor(experience / XP_PER_LEVEL) + 1. */
export const XP_PER_LEVEL = 100;

export interface UserProfile {
  id: string;
  telegramId: string;
  telegramUsername: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  country: string | null;
  language: LanguageCode;

  /** Self-declared age band, or null on accounts that predate the question. */
  ageBand: AgeBand | null;
  /** True while `ageBand` is CHILD — the flag the UI actually branches on,
   * so screens don't have to know which bands count as "child". */
  childMode: boolean;
  /** Whether a guardian PIN is set. The PIN itself never leaves the server. */
  guardianPinSet: boolean;

  level: number;
  experience: number;
  coins: number;
  rating: number;
  /** Title for the current `rating` — see `getTitleForRating`. */
  title: string;

  gamesPlayed: number;
  /** Completed duels only (win, loss, or draw) — see `winRate`. */
  duelsPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDrawn: number;
  /** % of decided duels (win or loss, draws excluded) that were won. */
  winRate: number;

  /** Consecutive days with at least one completed chapter check-up. */
  currentStreak: number;
  longestStreak: number;
  /** Chosen streak-goal target in days (see `STREAK_GOAL_OPTIONS`), or null
   * if none set yet. */
  streakGoalDays: number | null;
  /** True once the coin reward for `streakGoalDays` has been granted. */
  streakGoalRewarded: boolean;

  createdAt: string;

  /** True until the user picks a nickname for the first time. */
  needsOnboarding: boolean;
}

export interface UpdateProfileInput {
  nickname?: string;
  avatarUrl?: string | null;
  country?: string | null;
  language?: LanguageCode;
  ageBand?: AgeBand;
  /** Sent alongside `ageBand` when leaving the child mode on an account that
   * has a guardian PIN set. */
  guardianPin?: string;
  /** Set when the guardian accepted the child-mode screen. */
  guardianConfirmed?: boolean;
}

export interface AuthResponse {
  accessToken: string;
  user: UserProfile;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
  country: string | null;
  level: number;
  rating: number;
  title: string;
  gamesWon: number;
  gamesLost: number;
  isMe: boolean;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  /** Present only when the current user isn't already in `entries`. */
  me: LeaderboardEntry | null;
}
