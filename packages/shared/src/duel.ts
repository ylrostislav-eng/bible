import type { GameQuestion } from './game';

export const DUEL_QUESTION_COUNT_MIN = 5;
export const DUEL_QUESTION_COUNT_MAX = 50;
export const DUEL_QUESTION_COUNT_DEFAULT = 10;

export interface CreateDuelInput {
  questionCount: number;
}

export interface CreateDuelResponse {
  sessionId: string;
  inviteCode: string;
}

/** Fetched by the joiner after entering an invite code, before committing to
 * join — lets them see the host's chosen question count and lower it (never
 * raise it) before the duel actually starts. */
export interface DuelPreviewResponse {
  sessionId: string;
  hostNickname: string | null;
  questionCount: number;
}

export interface JoinDuelInput {
  inviteCode: string;
  /** Only meaningful if lower than the host's original count — the joiner
   * can shrink the duel, never grow it. Omit to accept the host's count
   * as-is. */
  questionCount?: number;
}

export interface JoinDuelResponse {
  sessionId: string;
}

export interface DuelParticipantView {
  userId: string;
  nickname: string | null;
  avatarUrl: string | null;
  correctCount: number;
  score: number;
  streak: number;
  /** Meaningful only once the duel is COMPLETED — 0 while in progress. */
  xpEarned: number;
  coinsEarned: number;
  ratingDelta: number;
  /** True if the daily duel-win rating cap zeroed `ratingDelta` out. */
  ratingCapped: boolean;
}

export interface DuelRoundAnswer {
  selectedIndex: number | null;
  isCorrect: boolean | null;
  scoreDelta: number;
}

export type DuelStateStatus = 'WAITING_FOR_OPPONENT' | 'IN_PROGRESS' | 'COMPLETED';

/**
 * Polled by the client roughly every second while a duel is active. A single
 * shape (rather than a discriminated union) keeps the client's rendering
 * logic simple — fields not relevant to the current `status` are null.
 */
export interface DuelState {
  sessionId: string;
  status: DuelStateStatus;
  inviteCode: string | null;
  questionCount: number;
  timeLimitSeconds: number;

  you: DuelParticipantView;
  opponent: DuelParticipantView | null;

  questionNumber: number | null;
  question: GameQuestion | null;
  secondsRemaining: number | null;
  youAnswered: boolean;
  opponentAnswered: boolean;
  /** True once both participants have answered the current question (or the timer ran out). */
  roundResolved: boolean;
  /** Reveal for the round that just resolved; call `/next` to advance past it. */
  reveal: {
    correctIndex: number;
    explanation: string;
    book: string;
    chapter: number | null;
    verses: string | null;
    you: DuelRoundAnswer;
    opponent: DuelRoundAnswer;
  } | null;

  outcome: 'win' | 'loss' | 'draw' | null;
}

export interface DuelAnswerInput {
  questionId: string;
  answerIndex: number;
}
