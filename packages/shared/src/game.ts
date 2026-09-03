import type { StreakSummary } from './streak';

export const TESTAMENTS = ['OLD', 'NEW'] as const;
export type Testament = (typeof TESTAMENTS)[number];

export const TESTAMENT_NAMES: Record<Testament, string> = {
  OLD: 'Ветхий Завет',
  NEW: 'Новый Завет',
};

export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  EASY: 'Лёгкий',
  MEDIUM: 'Средний',
  HARD: 'Сложный',
};

export const SOLO_QUESTION_COUNT_OPTIONS = [5, 10, 15, 20] as const;
export const SOLO_QUESTION_COUNT_MIN = 1;
export const SOLO_QUESTION_COUNT_MAX = 40;

/** A question as sent to the player — never includes the correct answer. */
export interface GameQuestion {
  id: string;
  text: string;
  options: string[];
  testament: Testament;
  book: string;
  chapter: number | null;
  topic: string | null;
  difficulty: Difficulty;
}

export interface StartSoloGameInput {
  questionCount: number;
  testament?: Testament;
  difficulty?: Difficulty;
}

export interface StartSoloGameResponse {
  sessionId: string;
  totalQuestions: number;
  questionNumber: number;
  question: GameQuestion;
}

export interface SubmitAnswerInput {
  questionId: string;
  answerIndex: number;
  timeTakenMs?: number;
}

export interface SubmitAnswerResult {
  correct: boolean;
  correctIndex: number;
  explanation: string;
  book: string;
  chapter: number | null;
  verses: string | null;
  correctCount: number;
  totalQuestions: number;
  finished: boolean;
  questionNumber: number;
  nextQuestion: GameQuestion | null;
  /** Present only when `finished` is true. */
  summary?: GameSummary;
}

export interface GameSummary {
  sessionId: string;
  totalQuestions: number;
  correctCount: number;
  score: number;
  xpEarned: number;
  coinsEarned: number;
  leveledUp: boolean;
  level: number;
  /** How this game left the daily streak — solo games count toward it too. */
  streak: StreakSummary;
}
