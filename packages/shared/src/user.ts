import type { LanguageCode } from './language';

export const NICKNAME_MIN_LENGTH = 3;
export const NICKNAME_MAX_LENGTH = 20;
/** Letters (any script), digits, and underscores only. */
export const NICKNAME_PATTERN = /^[\p{L}0-9_]+$/u;

export interface UserProfile {
  id: string;
  telegramId: string;
  telegramUsername: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  country: string | null;
  language: LanguageCode;

  level: number;
  experience: number;
  coins: number;
  rating: number;

  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  winRate: number;

  /** Consecutive days with at least one completed chapter check-up. */
  currentStreak: number;
  longestStreak: number;

  createdAt: string;

  /** True until the user picks a nickname for the first time. */
  needsOnboarding: boolean;
}

export interface UpdateProfileInput {
  nickname?: string;
  avatarUrl?: string | null;
  country?: string | null;
  language?: LanguageCode;
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
  gamesWon: number;
  gamesLost: number;
  isMe: boolean;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  /** Present only when the current user isn't already in `entries`. */
  me: LeaderboardEntry | null;
}
