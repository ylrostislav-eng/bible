import type { GameQuestion } from './game';

/** Hard ceiling on room size — kept modest for now; can grow later once the
 * WebSocket fan-out and simultaneous-answer UI have been proven at scale. */
export const ROOM_MAX_PARTICIPANTS = 20;
/** Below this, a room's outcome is casual (XP/coins only) — matches the
 * existing 1v1 DUEL mode for exactly 2 competitive players. */
export const ROOM_MIN_PARTICIPANTS_FOR_RATING = 3;
/** Raw rating points a user can earn from room matches per day. Unlike the
 * 1v1 duel cap (a win count), this is points-based and *clips* the reward
 * that crosses it rather than zeroing it — see `RoomsService.applyRoomRewards`. */
export const ROOM_DAILY_RATING_CAP = 100;

export type RoomVisibility = 'PUBLIC' | 'PRIVATE';

export interface CreateRoomInput {
  visibility: RoomVisibility;
  questionCount: number;
  /** Shown in the public room list; also visible to participants in the lobby. */
  roomName?: string;
  /** Defaults to, and is capped at, `ROOM_MAX_PARTICIPANTS`. */
  maxParticipants?: number;
}

export interface CreateRoomResponse {
  sessionId: string;
  inviteCode: string;
  /** Auto-generated, non-colliding-with-recently-issued passwords — only
   * present for a PRIVATE room; share it alongside the code. */
  password: string | null;
}

/** One row in the public room browser — anyone can join these directly,
 * no code or password needed. */
export interface RoomSummary {
  sessionId: string;
  /** Safe to expose for a PUBLIC room — it's already freely joinable with
   * no password, so this just saves typing it in by hand. */
  inviteCode: string;
  roomName: string | null;
  leaderNickname: string | null;
  participantCount: number;
  maxParticipants: number;
  questionCount: number;
}

export interface JoinRoomInput {
  inviteCode: string;
  /** Required only when the room is PRIVATE. */
  password?: string;
}

export interface JoinRoomResponse {
  sessionId: string;
}

export interface RoomParticipantView {
  userId: string;
  nickname: string | null;
  avatarUrl: string | null;
  isLeader: boolean;
  /** Meaningless once the room leaves LOBBY (always false after start). */
  isReady: boolean;
  correctCount: number;
  score: number;
  streak: number;
  /** Meaningful only once the room is COMPLETED — 0 while in progress. */
  xpEarned: number;
  coinsEarned: number;
  ratingDelta: number;
  /** True if the daily room-rating cap clipped `ratingDelta` down. */
  ratingCapped: boolean;
}

export type RoomStateStatus = 'LOBBY' | 'IN_PROGRESS' | 'COMPLETED';

export interface RoomRoundAnswer {
  userId: string;
  selectedIndex: number | null;
  isCorrect: boolean | null;
  scoreDelta: number;
}

/**
 * Pushed over the WebSocket to everyone in the room on every state change.
 * A single shape (rather than a discriminated union) keeps client rendering
 * simple — fields not relevant to the current `status` are null.
 */
export interface RoomState {
  sessionId: string;
  status: RoomStateStatus;
  roomName: string | null;
  visibility: RoomVisibility | null;
  inviteCode: string | null;
  /** Only ever populated in the copy sent to the leader — never broadcast
   * to other participants. */
  password: string | null;
  questionCount: number;
  maxParticipants: number;
  timeLimitSeconds: number;

  you: RoomParticipantView;
  leaderId: string;
  /** Everyone currently in the room, leader included — order is join order. */
  participants: RoomParticipantView[];

  questionNumber: number | null;
  question: GameQuestion | null;
  secondsRemaining: number | null;
  /** Everyone who has locked in an answer for the current question. */
  answeredUserIds: string[];
  /** True once every participant has answered the current question (or the
   * timer ran out). */
  roundResolved: boolean;
  reveal: {
    correctIndex: number;
    explanation: string;
    book: string;
    chapter: number | null;
    verses: string | null;
    answers: RoomRoundAnswer[];
  } | null;

  /** Final standings, best to worst — only set once COMPLETED. */
  finalRanking: RoomParticipantView[] | null;
}

export interface RoomAnswerInput {
  questionId: string;
  answerIndex: number;
}

/** Socket.IO namespace the room gateway listens on. */
export const ROOM_WS_NAMESPACE = '/rooms';

/** Client -> server event names. Payloads:
 * - `room:enter` / `room:leave`: `{ sessionId: string }`
 * - `room:ready`: `{ sessionId: string, ready: boolean }`
 * - `room:kick` / `room:ban`: `{ sessionId: string, userId: string }`
 * - `room:start` / `room:advance`: `{ sessionId: string }`
 * - `room:answer`: `{ sessionId: string } & RoomAnswerInput` */
export const ROOM_WS_EVENTS = {
  enter: 'room:enter',
  leave: 'room:leave',
  ready: 'room:ready',
  kick: 'room:kick',
  ban: 'room:ban',
  start: 'room:start',
  answer: 'room:answer',
  advance: 'room:advance',
} as const;

/** Server -> client event names.
 * - `room:state`: `RoomState`
 * - `room:error`: `{ message: string }` — a specific *action* (ready/kick/
 *   ban/start/answer) failed; the caller is still a legitimate participant
 *   and the current `RoomState` (if any) stays valid.
 * - `room:kicked` / `room:banned`: sent only to the removed participant, no
 *   payload — fired at the moment a connected participant is actually
 *   removed.
 * - `room:unavailable`: `{ message: string }` — `room:enter` itself failed
 *   (e.g. kicked/banned while not connected, or a stale/invalid session).
 *   No `RoomState` exists to show; the client should treat this the same
 *   as being removed and drop back out, not display a stuck loading state. */
export const ROOM_WS_SERVER_EVENTS = {
  state: 'room:state',
  error: 'room:error',
  kicked: 'room:kicked',
  banned: 'room:banned',
  unavailable: 'room:unavailable',
} as const;

/** One entry in the current user's room blacklist (as leader) — this user
 * can never join any room they lead until unbanned. Independent of any
 * specific room; managed from the profile, not from inside a room. */
export interface BannedUserView {
  userId: string;
  nickname: string | null;
  avatarUrl: string | null;
  level: number;
  rating: number;
  title: string;
  bannedAt: string;
}

export interface BanUserInput {
  userId: string;
}
