'use client';

import type { CreateRoomResponse, JoinRoomResponse, RoomSummary } from '@bible-arena/shared';
import {
  DIFFICULTY_NAMES,
  DUEL_QUESTION_COUNT_DEFAULT,
  DUEL_QUESTION_COUNT_MAX,
  DUEL_QUESTION_COUNT_MIN,
  ROOM_INTRO_STEP_MS,
  ROOM_MAX_PARTICIPANTS,
  TESTAMENT_NAMES,
} from '@bible-arena/shared';
import clsx from 'clsx';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TournamentIcon } from '@/components/icons/nav-icons';
import { RoomInvitePicker } from '@/components/room-invite-picker';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { QuestionCountSlider } from '@/components/ui/question-count-slider';
import { Spinner } from '@/components/ui/spinner';
import { useActiveGame } from '@/lib/active-game-context';
import { ApiError, apiClient } from '@/lib/api';
import { useIncomingRoomInvites } from '@/lib/incoming-room-invites-context';
import { useIntroCountdown } from '@/lib/use-intro-countdown';
import { useRoomSocket } from '@/lib/use-room-socket';
import { useSyncProfileOnce } from '@/lib/use-sync-profile-once';

const PUBLIC_ROOMS_POLL_MS = 5000;

type Menu = 'menu' | 'create' | 'join';

export default function RoomPage() {
  const { syncProfile, syncFailed: profileSyncFailed } = useSyncProfileOnce();
  const { activeGame, setActiveGame } = useActiveGame();
  const { invites: pendingInvites, removeInvite } = useIncomingRoomInvites();

  const [menu, setMenu] = useState<Menu>('menu');
  const [publicRooms, setPublicRooms] = useState<RoomSummary[]>([]);
  const [respondingInviteId, setRespondingInviteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [roomName, setRoomName] = useState('');
  const [questionCount, setQuestionCount] = useState(DUEL_QUESTION_COUNT_DEFAULT);
  const [maxParticipants, setMaxParticipants] = useState(ROOM_MAX_PARTICIPANTS);

  const [joinCode, setJoinCode] = useState('');
  const [joinPassword, setJoinPassword] = useState('');

  // Picks up an already-in-progress room from before the user navigated
  // away — see `ActiveGameProvider` and the sync effect below.
  const [sessionId, setSessionId] = useState<string | null>(() =>
    activeGame?.type === 'room' ? activeGame.sessionId : null,
  );
  const [, setRewardsApplied] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [displaySeconds, setDisplaySeconds] = useState<number | null>(null);
  const [invitePickerOpen, setInvitePickerOpen] = useState(false);

  const {
    roomState,
    error: liveError,
    removed,
    unavailable,
    setReady,
    kick,
    ban,
    start,
    answer,
    leave,
  } = useRoomSocket(sessionId);

  // Keeps the global "active game" record pointed at whichever room this
  // page is actually showing — but not once we've been removed: without
  // the `removed` guard this would immediately re-set the very record
  // `clearOnRemoval` below just cleared (its dependency on `activeGame`
  // means it re-runs right after that clear), pointing "Играть" straight
  // back at a room we're no longer in.
  useEffect(() => {
    function syncActiveGame() {
      if (removed || roomState?.status === 'COMPLETED') return;
      if (!sessionId) return;
      if (
        activeGame?.type !== 'room' ||
        activeGame.sessionId !== sessionId ||
        activeGame.status !== roomState?.status
      ) {
        setActiveGame({ type: 'room', sessionId, status: roomState?.status });
      }
    }
    syncActiveGame();
  }, [sessionId, activeGame, setActiveGame, removed, roomState?.status]);

  // Clear the global "active game" record the instant we're removed, not
  // just once the user taps "Назад" — otherwise the "Играть" tab would keep
  // routing back into a room that no longer wants them. Deliberately leaves
  // `sessionId` itself alone here — clearing it would immediately reset
  // this hook's `removed` too (see `useRoomSocket`'s per-session reset),
  // dismissing the "Вас исключили" screen before the user ever saw it.
  useEffect(() => {
    function clearOnRemoval() {
      if (removed) setActiveGame(null);
    }
    clearOnRemoval();
  }, [removed, setActiveGame]);

  // Same idea for a room that simply finished normally: it isn't "active"
  // anymore, so stop routing "Играть" back into its final-standings screen.
  // "На главную" is a plain link (not a reset), so without this the record
  // would otherwise sit there forever pointing at a dead room.
  useEffect(() => {
    function clearOnCompletion() {
      if (roomState?.status === 'COMPLETED') setActiveGame(null);
    }
    clearOnCompletion();
  }, [roomState?.status, setActiveGame]);

  useEffect(() => {
    if (sessionId || menu !== 'menu') return undefined;
    let cancelled = false;

    async function load() {
      try {
        const rooms = await apiClient.get<RoomSummary[]>('/rooms');
        if (!cancelled) setPublicRooms(rooms);
      } catch {
        // Transient poll failures are ignored — the next tick will retry.
      }
    }

    void load();
    const interval = setInterval(() => void load(), PUBLIC_ROOMS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, menu]);

  useEffect(() => {
    if (roomState?.status !== 'COMPLETED') return;
    function applyRewardsOnce() {
      setRewardsApplied((already) => {
        if (!already) syncProfile();
        return true;
      });
    }
    applyRewardsOnce();
  }, [roomState?.status, syncProfile]);

  // A new question means a fresh choice — clear any highlight left over
  // from the previous round.
  useEffect(() => {
    function resetSelection() {
      setSelectedIndex(null);
    }
    resetSelection();
  }, [roomState?.questionNumber]);

  // The server only pushes a fresh `secondsRemaining` on discrete events
  // (an answer, the round resolving, a new question) — there's no polling
  // to naturally tick it down in between like the 1v1 duel screen has.
  // Resync a local display clock to whatever the server just sent, then
  // count it down ourselves once a second until the next push corrects it.
  useEffect(() => {
    if (roomState?.status !== 'IN_PROGRESS' || roomState.secondsRemaining === null) {
      return undefined;
    }
    const initialSeconds = roomState.secondsRemaining;
    function resync() {
      setDisplaySeconds(initialSeconds);
    }
    resync();
    const interval = setInterval(() => {
      setDisplaySeconds((s) => (s === null ? null : Math.max(0, s - 1)));
    }, 1000);
    return () => clearInterval(interval);
  }, [roomState?.status, roomState?.secondsRemaining, roomState?.questionNumber]);

  // Pre-match "3, 2, 1, Поехали!" countdown, shown once per room right as it
  // reaches question 1 — mirrors the 1v1 duel screen's. Not just cosmetic
  // timing: `RoomsService.start` delays the real `currentQuestionStartedAt`
  // (and `RoomsGateway.onStart` pads its auto-timeout timer) by the exact
  // same `ROOM_INTRO_TOTAL_MS`, so this countdown runs *before* the actual
  // answering window starts rather than eating into it. See
  // `useIntroCountdown` for why "shown once" is tracked via sessionStorage
  // rather than a plain ref.
  const introStep = useIntroCountdown({
    sessionId,
    active: roomState?.status === 'IN_PROGRESS' && roomState.questionNumber === 1,
    storageKey: 'bible-arena:room-intro-shown-for',
    stepMs: ROOM_INTRO_STEP_MS,
  });

  const createRoom = useCallback(async () => {
    const trimmedName = roomName.trim();
    if (!trimmedName) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.post<CreateRoomResponse>('/rooms', {
        visibility,
        questionCount,
        roomName: trimmedName,
        maxParticipants,
      });
      setSessionId(res.sessionId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось создать комнату');
    } finally {
      setLoading(false);
    }
  }, [visibility, questionCount, roomName, maxParticipants]);

  const joinRoom = useCallback(async (inviteCode: string, password?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.post<JoinRoomResponse>('/rooms/join', {
        inviteCode: inviteCode.toUpperCase(),
        password: password || undefined,
      });
      setSessionId(res.sessionId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось присоединиться к комнате');
    } finally {
      setLoading(false);
    }
  }, []);

  const acceptInvite = useCallback(
    async (inviteId: string) => {
      setRespondingInviteId(inviteId);
      setError(null);
      try {
        const res = await apiClient.post<JoinRoomResponse>(`/rooms/invites/${inviteId}/accept`);
        removeInvite(inviteId);
        setSessionId(res.sessionId);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Не удалось присоединиться к комнате');
      } finally {
        setRespondingInviteId(null);
      }
    },
    [removeInvite],
  );

  const declineInvite = useCallback(
    async (inviteId: string) => {
      setRespondingInviteId(inviteId);
      try {
        await apiClient.post(`/rooms/invites/${inviteId}/decline`);
        removeInvite(inviteId);
      } catch {
        // The next poll will re-sync the list either way.
      } finally {
        setRespondingInviteId(null);
      }
    },
    [removeInvite],
  );

  const reset = useCallback(() => {
    setSessionId(null);
    setActiveGame(null);
    setRewardsApplied(false);
    setSelectedIndex(null);
    setDisplaySeconds(null);
    setError(null);
    setJoinCode('');
    setJoinPassword('');
    setRoomName('');
    setMenu('menu');
  }, [setActiveGame]);

  // `room:enter` itself failed — most commonly because this session's
  // stored sessionId points at a room we were kicked/banned from while we
  // had no live connection to receive the usual `kicked`/`banned` event
  // (e.g. sitting on another tab at the time). No `RoomState` will ever
  // arrive, so there's nothing to show — silently drop back to the room
  // menu instead of leaving the "Подключение…" spinner stuck forever.
  useEffect(() => {
    function bounceToMenu() {
      if (unavailable) reset();
    }
    bounceToMenu();
  }, [unavailable, reset]);

  const [copiedField, setCopiedField] = useState<'code' | 'password' | null>(null);
  const copy = useCallback((text: string, field: 'code' | 'password') => {
    void navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField((current) => (current === field ? null : current)), 1500);
  }, []);

  // --- Removed from the room ---

  if (removed) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 pt-10 text-center">
        <h1 className="text-xl font-bold">
          {removed === 'banned' ? 'Вас заблокировали в этой комнате' : 'Вас исключили из комнаты'}
        </h1>
        <p className="text-sm text-text-secondary">
          {removed === 'banned'
            ? 'Лидер этой комнаты больше не пустит вас ни в одну свою комнату.'
            : 'Лидер комнаты исключил вас перед началом игры.'}
        </p>
        <Button onClick={reset} className="max-w-xs">
          Назад
        </Button>
      </div>
    );
  }

  // --- Active room (created/joined, waiting on the live socket state) ---

  if (sessionId) {
    if (!roomState) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-sm text-text-secondary">
          <Spinner />
          {liveError && <p className="text-danger">{liveError}</p>}
        </div>
      );
    }

    const me = roomState.you;
    const isLeader = me.isLeader;

    if (roomState.status === 'LOBBY') {
      const others = roomState.participants.filter((p) => p.userId !== me.userId);
      const notReadyCount = others.filter((p) => !p.isReady).length;
      const canStart = isLeader && roomState.participants.length >= 2 && notReadyCount === 0;

      return (
        <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface">
              <TournamentIcon className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold">{roomState.roomName ?? 'Комната'}</h1>
              <p className="text-sm text-text-secondary">
                {roomState.participants.length}/{roomState.maxParticipants} игроков
              </p>
            </div>
          </div>

          <Card className="flex-col gap-2">
            {roomState.inviteCode && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-text-secondary">Код комнаты</span>
                <CopyRow
                  value={roomState.inviteCode}
                  copied={copiedField === 'code'}
                  onCopy={() => roomState.inviteCode && copy(roomState.inviteCode, 'code')}
                />
              </div>
            )}
            {roomState.password && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-text-secondary">Пароль</span>
                <CopyRow
                  value={roomState.password}
                  copied={copiedField === 'password'}
                  onCopy={() => roomState.password && copy(roomState.password, 'password')}
                />
              </div>
            )}
          </Card>

          {isLeader && (
            <Card className="flex-col gap-3">
              <button
                onClick={() => setInvitePickerOpen((open) => !open)}
                className="flex items-center justify-between text-sm font-semibold text-text-secondary"
              >
                <span>Пригласить друзей</span>
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  className={clsx('h-4 w-4 transition-transform', invitePickerOpen && 'rotate-180')}
                >
                  <path
                    d="M5 7.5l5 5 5-5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {invitePickerOpen && (
                <RoomInvitePicker
                  sessionId={sessionId}
                  excludeUserIds={roomState.participants.map((p) => p.userId)}
                />
              )}
            </Card>
          )}

          <Card className="flex-col gap-3">
            <p className="text-sm font-semibold text-text-secondary">Участники</p>
            {roomState.participants.map((p) => (
              <div key={p.userId} className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {p.nickname ?? 'Игрок'}
                    {p.userId === me.userId && ' (вы)'}
                  </span>
                  {p.isLeader ? (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      Лидер
                    </span>
                  ) : (
                    <span
                      className={clsx(
                        'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
                        p.isReady
                          ? 'bg-success/10 text-success'
                          : 'bg-surface-hover text-text-muted',
                      )}
                    >
                      {p.isReady ? 'Готов' : 'Не готов'}
                    </span>
                  )}
                </div>
                {isLeader && !p.isLeader && (
                  <div className="flex shrink-0 gap-2 text-xs">
                    <button
                      onClick={() => kick(p.userId)}
                      className="text-text-muted hover:text-danger"
                    >
                      Кикнуть
                    </button>
                    <button
                      onClick={() => ban(p.userId)}
                      className="text-text-muted hover:text-danger"
                    >
                      Забанить
                    </button>
                  </div>
                )}
              </div>
            ))}
          </Card>

          {(error || liveError) && <p className="text-sm text-danger">{error ?? liveError}</p>}

          {isLeader ? (
            <>
              <Button onClick={start} disabled={!canStart}>
                {roomState.participants.length < 2
                  ? 'Ждём игроков…'
                  : notReadyCount > 0
                    ? `Ждём готовности (${notReadyCount})`
                    : 'Начать игру'}
              </Button>
              <button
                onClick={() => {
                  leave();
                  reset();
                }}
                className="text-center text-sm text-text-secondary"
              >
                Закрыть комнату
              </button>
            </>
          ) : (
            <>
              <Button
                onClick={() => setReady(!me.isReady)}
                variant={me.isReady ? 'secondary' : 'primary'}
              >
                {me.isReady ? 'Отменить готовность' : 'Готов!'}
              </Button>
              <button
                onClick={() => {
                  leave();
                  reset();
                }}
                className="text-center text-sm text-text-secondary"
              >
                Покинуть комнату
              </button>
            </>
          )}
        </div>
      );
    }

    if (roomState.status === 'COMPLETED') {
      const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
      const ranking = roomState.finalRanking ?? [];

      return (
        <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-10">
          <h1 className="text-center text-xl font-bold">Игра завершена</h1>

          <Card className="flex-col gap-2">
            {ranking.map((p, index) => (
              <div
                key={p.userId}
                className={clsx(
                  'flex items-center justify-between gap-2 rounded-lg px-2 py-1.5',
                  p.userId === me.userId && 'bg-primary/10',
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-5 shrink-0 text-sm font-bold text-text-muted">
                    {index + 1}
                  </span>
                  <span className="truncate text-sm font-medium">
                    {p.nickname ?? 'Игрок'}
                    {p.userId === me.userId && ' (вы)'}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-sm">
                  <span className="text-text-secondary">{p.correctCount} прав.</span>
                  <span
                    className={clsx(
                      'font-semibold',
                      p.ratingDelta < 0 ? 'text-danger' : 'text-primary',
                    )}
                  >
                    {signed(p.ratingDelta)}
                  </span>
                </div>
              </div>
            ))}
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card className="flex-col items-center">
              <p className="text-xs text-text-secondary">Опыт</p>
              <p className="text-xl font-bold text-primary">+{me.xpEarned}</p>
            </Card>
            <Card className="flex-col items-center">
              <p className="text-xs text-text-secondary">Монеты</p>
              <p className="text-xl font-bold text-primary">+{me.coinsEarned}</p>
            </Card>
          </div>

          {me.ratingCapped && (
            <p className="text-xs text-text-muted">
              Дневной лимит очков «Знаний» за игры в комнатах достигнут — награда засчитана
              частично. Завтра лимит обновится.
            </p>
          )}
          {profileSyncFailed && (
            <p className="text-xs text-text-muted">
              Награда сохранена, но профиль не успел обновиться — актуальные цифры появятся при
              следующем заходе в приложение.
            </p>
          )}

          <Button onClick={reset}>Новая комната</Button>
          <Link href="/" className="text-center text-sm text-text-secondary">
            На главную
          </Link>
        </div>
      );
    }

    // Pre-match countdown — shown instead of question 1 for a beat right as
    // the room actually begins, so it doesn't just snap straight into
    // gameplay the instant the leader hits "Начать игру".
    if (roomState.status === 'IN_PROGRESS' && introStep !== null) {
      return (
        <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="w-full truncate text-sm text-text-secondary">
            {roomState.roomName ?? 'Комната'} · {roomState.participants.length} игроков
          </p>
          <div key={introStep} className="duel-intro-pop">
            {introStep === 0 ? (
              <p className="text-5xl font-extrabold tracking-tight text-primary">Поехали!</p>
            ) : (
              <p className="text-8xl font-extrabold text-primary">{introStep}</p>
            )}
          </div>
        </div>
      );
    }

    // IN_PROGRESS
    const { question } = roomState;
    if (!question) {
      // Should self-correct on the next push in the ordinary case (a brief
      // gap right as the round advances) — but if this participant's own
      // answer row is genuinely missing for the current question, no future
      // push will ever fix that, so this can't be a bare, escape-less
      // "Загрузка…" — give the user a way out instead of a permanent hang.
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-sm text-text-secondary">
          <Spinner />
          <p>Загрузка…</p>
          <button onClick={reset} className="text-sm text-text-secondary underline">
            Назад
          </button>
        </div>
      );
    }
    const myReveal = roomState.reveal?.answers.find((a) => a.userId === me.userId) ?? null;

    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6">
        <div className="flex items-center justify-between text-sm">
          <p className="font-semibold">{me.score} очков</p>
          <div className="text-center text-text-secondary">
            <p>
              Вопрос {roomState.questionNumber} из {roomState.questionCount}
            </p>
            <p className="text-xs">{displaySeconds ?? roomState.secondsRemaining}с</p>
          </div>
          <p className="text-text-secondary">
            Ответили {roomState.answeredUserIds.length}/{roomState.participants.length}
          </p>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{
              width: `${
                ((roomState.timeLimitSeconds -
                  (displaySeconds ?? roomState.secondsRemaining ?? 0)) /
                  roomState.timeLimitSeconds) *
                100
              }%`,
            }}
          />
        </div>

        <Card className="flex-col gap-2">
          <div className="flex gap-2 text-xs text-text-muted">
            <span>{TESTAMENT_NAMES[question.testament]}</span>
            <span>·</span>
            <span>
              {question.book}
              {question.chapter ? `, гл. ${question.chapter}` : ''}
            </span>
            <span>·</span>
            <span>{DIFFICULTY_NAMES[question.difficulty]}</span>
          </div>
          <p className="text-lg font-semibold">{question.text}</p>
        </Card>

        <div className="flex flex-col gap-3">
          {question.options.map((option, index) => {
            const reveal = roomState.reveal;
            const isCorrectOption = reveal && index === reveal.correctIndex;
            const isMySelection = reveal
              ? myReveal?.selectedIndex === index
              : selectedIndex === index;
            const isWrongSelection = reveal && isMySelection && myReveal && !myReveal.isCorrect;

            return (
              <button
                key={index}
                onClick={() => {
                  setSelectedIndex(index);
                  answer({ questionId: question.id, answerIndex: index });
                }}
                disabled={roomState.answeredUserIds.includes(me.userId) || !!reveal}
                className={clsx(
                  'flex h-14 items-center rounded-xl border px-4 text-left text-sm font-medium transition disabled:cursor-not-allowed',
                  !reveal && !isMySelection && 'border-border bg-surface hover:bg-surface-hover',
                  !reveal && isMySelection && 'border-primary bg-primary/10',
                  reveal && isCorrectOption && 'border-success bg-success/10 text-success',
                  reveal && isWrongSelection && 'border-danger bg-danger/10 text-danger',
                  reveal &&
                    !isCorrectOption &&
                    !isWrongSelection &&
                    'border-border bg-surface text-text-muted',
                )}
              >
                {option}
              </button>
            );
          })}
        </div>

        {roomState.answeredUserIds.includes(me.userId) && !roomState.roundResolved && (
          <p className="text-center text-sm text-text-secondary">Ждём остальных игроков…</p>
        )}

        {roomState.reveal && (
          <Card className="flex-col gap-2">
            <p className="text-sm text-text-secondary">{roomState.reveal.explanation}</p>
            <p className="text-xs text-text-muted">
              {roomState.reveal.verses
                ? `${roomState.reveal.book} ${roomState.reveal.verses}`
                : roomState.reveal.book}
            </p>
            <p className="text-xs text-text-muted">Следующий вопрос через несколько секунд…</p>
          </Card>
        )}
      </div>
    );
  }

  // --- Setup views (no active session yet) ---

  if (menu === 'create') {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-6">
        <h1 className="text-xl font-bold">Создать комнату</h1>

        <div className="flex gap-2">
          {(['PUBLIC', 'PRIVATE'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVisibility(v)}
              className={clsx(
                'h-10 flex-1 rounded-lg text-sm font-semibold transition',
                visibility === v
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-hover text-text-secondary',
              )}
            >
              {v === 'PUBLIC' ? 'Открытая' : 'Приватная'}
            </button>
          ))}
        </div>
        <p className="-mt-3 text-xs text-text-muted">
          {visibility === 'PUBLIC'
            ? 'Видна всем в списке комнат, присоединиться может любой'
            : 'Скрыта от списка, для входа нужен пароль (создастся автоматически)'}
        </p>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary">Название комнаты</span>
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value.slice(0, 40))}
            placeholder="Например, «Вечерняя викторина»"
            className="h-12 rounded-xl border border-border bg-surface px-4 text-sm outline-none focus:border-primary"
          />
          <span className="text-xs text-text-muted">
            Должно отличаться от названий других открытых сейчас комнат
          </span>
        </label>

        <Card className="flex-col gap-3">
          <QuestionCountSlider
            label="Количество вопросов"
            value={questionCount}
            min={DUEL_QUESTION_COUNT_MIN}
            max={DUEL_QUESTION_COUNT_MAX}
            onChange={setQuestionCount}
          />
        </Card>
        <Card className="flex-col gap-3">
          <QuestionCountSlider
            label="Максимум игроков"
            value={maxParticipants}
            min={2}
            max={ROOM_MAX_PARTICIPANTS}
            onChange={setMaxParticipants}
          />
        </Card>

        {error && <p className="text-sm text-danger">{error}</p>}
        <Button onClick={createRoom} disabled={loading || roomName.trim().length === 0}>
          {loading ? 'Создание…' : 'Создать комнату'}
        </Button>
        <button onClick={() => setMenu('menu')} className="text-center text-sm text-text-secondary">
          Назад
        </button>
      </div>
    );
  }

  if (menu === 'join') {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-6">
        <h1 className="text-xl font-bold">Присоединиться по коду</h1>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary">Код комнаты</span>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="ABCDEF"
            className="h-12 rounded-xl border border-border bg-surface px-4 text-center text-lg font-bold tracking-[0.3em] outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary">
            Пароль (если комната приватная)
          </span>
          <input
            value={joinPassword}
            onChange={(e) => setJoinPassword(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="XXXXXX"
            className="h-12 rounded-xl border border-border bg-surface px-4 text-center text-lg font-bold tracking-[0.3em] outline-none focus:border-primary"
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button
          onClick={() => void joinRoom(joinCode, joinPassword)}
          disabled={loading || joinCode.length !== 6}
        >
          {loading ? 'Подключение…' : 'Присоединиться'}
        </Button>
        <button onClick={() => setMenu('menu')} className="text-center text-sm text-text-secondary">
          Назад
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-6">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface">
          <TournamentIcon className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Комната</h1>
          <p className="text-sm text-text-secondary">
            До {ROOM_MAX_PARTICIPANTS} игроков одновременно
          </p>
        </div>
      </div>

      <Button onClick={() => setMenu('create')}>Создать комнату</Button>
      <Button onClick={() => setMenu('join')} variant="secondary">
        Присоединиться по коду
      </Button>

      {/* Joining from this screen (a public room in the list, or an incoming
          invite) can fail for perfectly ordinary reasons — the room filled up
          or started while the list was on screen. Both handlers set `error`,
          but until this was here nothing rendered it: the button just stopped
          spinning and the room stayed where it was, with no way to tell
          whether it worked. */}
      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {pendingInvites.length > 0 && (
        <Card className="flex-col gap-3">
          <p className="text-sm font-semibold text-text-secondary">Входящие приглашения</p>
          {pendingInvites.map((invite) => (
            <div key={invite.inviteId} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{invite.roomName ?? 'Комната'}</p>
                <p className="text-xs text-text-muted">
                  {invite.fromNickname ?? 'Друг'} зовёт вас · {invite.participantCount}/
                  {invite.maxParticipants} · {invite.questionCount} вопросов
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => void acceptInvite(invite.inviteId)}
                  disabled={respondingInviteId === invite.inviteId}
                  className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-on-primary disabled:opacity-50"
                >
                  Присоединиться
                </button>
                <button
                  onClick={() => void declineInvite(invite.inviteId)}
                  disabled={respondingInviteId === invite.inviteId}
                  className="h-9 rounded-lg bg-surface-hover px-3 text-xs font-semibold text-text-secondary disabled:opacity-50"
                >
                  Отклонить
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Card className="flex-col gap-3">
        <p className="text-sm font-semibold text-text-secondary">Открытые комнаты</p>
        {publicRooms.length === 0 ? (
          <p className="py-2 text-center text-sm text-text-muted">Сейчас никто не играет</p>
        ) : (
          publicRooms.map((room) => (
            <div key={room.sessionId} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{room.roomName ?? 'Комната'}</p>
                <p className="text-xs text-text-muted">
                  {room.leaderNickname ?? 'Игрок'} · {room.participantCount}/{room.maxParticipants}{' '}
                  · {room.questionCount} вопросов
                </p>
              </div>
              <button
                onClick={() => void joinRoom(room.inviteCode)}
                disabled={loading}
                className="h-9 shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-on-primary disabled:opacity-50"
              >
                Войти
              </button>
            </div>
          ))
        )}
      </Card>

      <Link href="/play" className="text-center text-sm text-text-secondary">
        Назад
      </Link>
    </div>
  );
}

function CopyRow({
  value,
  copied,
  onCopy,
}: {
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <button
      onClick={onCopy}
      className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-surface-hover py-1 pl-3 pr-2 transition hover:border-primary"
    >
      <span className="font-mono text-base font-bold tracking-[0.2em] text-primary">{value}</span>
      <span className="flex h-6 w-6 items-center justify-center rounded-md text-text-secondary">
        {copied ? (
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-success">
            <path
              d="M4 10.5l3.5 3.5L16 5.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
            <rect
              x="7"
              y="7"
              width="10"
              height="10"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"
              stroke="currentColor"
              strokeWidth="1.6"
            />
          </svg>
        )}
      </span>
    </button>
  );
}
