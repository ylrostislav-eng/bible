'use client';

import type {
  CreateDuelResponse,
  DuelPreviewResponse,
  DuelState,
  JoinDuelResponse,
  PendingChallenge,
} from '@bible-arena/shared';
import {
  DIFFICULTY_NAMES,
  DUEL_QUESTION_COUNT_DEFAULT,
  DUEL_QUESTION_COUNT_MAX,
  DUEL_QUESTION_COUNT_MIN,
  TESTAMENT_NAMES,
} from '@bible-arena/shared';
import clsx from 'clsx';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FriendsIcon } from '@/components/icons/nav-icons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { OilLampFlame } from '@/components/ui/oil-lamp-flame';
import { QuestionCountSlider } from '@/components/ui/question-count-slider';
import { useActiveGame } from '@/lib/active-game-context';
import { ApiError, apiClient } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { pickEncouragement } from '@/lib/encouragement';
import { useIncomingChallenges } from '@/lib/incoming-challenges-context';

const POLL_INTERVAL_MS = 1200;
/** Set by the friends-tab "Вызвать" flow right before it navigates here, so
 * this page can pick the freshly created session up without a URL param
 * (which would force a Suspense boundary around an otherwise fully static
 * page for no real benefit — this is a one-shot handoff, not shareable state). */
const PENDING_SESSION_STORAGE_KEY = 'bible-arena:pending-duel-session';

type Menu = 'menu' | 'create' | 'join';

export default function DuelPage() {
  const { updateProfile } = useAuth();
  const { activeGame, setActiveGame } = useActiveGame();
  const { challenges: pendingChallenges, removeChallenge } = useIncomingChallenges();

  const [menu, setMenu] = useState<Menu>('menu');
  const [questionCount, setQuestionCount] = useState<number>(DUEL_QUESTION_COUNT_DEFAULT);
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [joinPreview, setJoinPreview] = useState<DuelPreviewResponse | null>(null);
  const [joinQuestionCount, setJoinQuestionCount] = useState<number>(DUEL_QUESTION_COUNT_MIN);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lazy initializer (not an effect) so a challenge-created session — or an
  // already-in-progress duel from before the user navigated away — is
  // picked up on the very first render, with no extra render round-trip and
  // no "setState in an effect" concern, since it never runs again.
  const [sessionId, setSessionId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const stashed = sessionStorage.getItem(PENDING_SESSION_STORAGE_KEY);
    if (stashed) {
      sessionStorage.removeItem(PENDING_SESSION_STORAGE_KEY);
      return stashed;
    }
    return activeGame?.type === 'duel' ? activeGame.sessionId : null;
  });
  const [duelState, setDuelState] = useState<DuelState | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [, setRewardsApplied] = useState(false);

  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [respondQuestionCount, setRespondQuestionCount] = useState<number>(DUEL_QUESTION_COUNT_MIN);

  // Keeps the app-wide "active game" record in sync with whichever session
  // this page is actually showing, however it got here (create/join/accept/
  // resumed-from-storage) — this is what lets `BottomNav` route "Играть"
  // straight back here, and what survives a navigate-away-and-back.
  useEffect(() => {
    function syncActiveGame() {
      if (sessionId && (activeGame?.type !== 'duel' || activeGame.sessionId !== sessionId)) {
        setActiveGame({ type: 'duel', sessionId });
      }
    }
    syncActiveGame();
  }, [sessionId, activeGame, setActiveGame]);

  // Recomputed only when the result actually changes (a new duel, or your
  // correct count settling once the match ends) — stays put while the
  // completed screen is being viewed, even though polling keeps re-fetching.
  const completionPercent =
    duelState && duelState.questionCount > 0
      ? duelState.you.correctCount / duelState.questionCount
      : 0;
  const completionPhrase = useMemo(() => pickEncouragement(completionPercent), [completionPercent]);

  useEffect(() => {
    if (!sessionId) return undefined;
    let cancelled = false;

    const poll = async () => {
      try {
        const state = await apiClient.get<DuelState>(`/game/duel/${sessionId}`);
        if (cancelled) return;
        setDuelState(state);
        // Only clear the highlight once we're not even in a round anymore —
        // NOT just because we've answered. `next()` already resets it when
        // moving to a new question; resetting on `youAnswered` here as well
        // used to null it out on the very first poll tick after answering,
        // before the opponent's reveal ever arrived, so the highlight
        // vanished into a "which one did I even pick?" blank state instead
        // of staying lit up until the red/green reveal took over.
        if (state.status !== 'IN_PROGRESS') {
          setSelectedIndex(null);
        }
        if (state.status === 'COMPLETED') {
          setRewardsApplied((already) => {
            if (!already) void updateProfile({});
            return true;
          });
        }
      } catch {
        // Transient poll failures are ignored — the next tick will retry.
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, updateProfile]);

  const startResponding = useCallback((challenge: PendingChallenge) => {
    setRespondingTo(challenge.sessionId);
    setRespondQuestionCount(challenge.questionCount);
    setError(null);
  }, []);

  const acceptChallenge = useCallback(async () => {
    if (!respondingTo) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.post<{ sessionId: string }>(
        `/game/duel/${respondingTo}/respond`,
        { action: 'ACCEPT', questionCount: respondQuestionCount },
      );
      removeChallenge(respondingTo);
      setSessionId(res.sessionId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось принять вызов');
    } finally {
      setLoading(false);
    }
  }, [respondingTo, respondQuestionCount, removeChallenge]);

  const declineChallenge = useCallback(
    async (challengeSessionId: string) => {
      setLoading(true);
      try {
        await apiClient.post(`/game/duel/${challengeSessionId}/respond`, {
          action: 'DECLINE',
        });
        removeChallenge(challengeSessionId);
        setRespondingTo((current) => (current === challengeSessionId ? null : current));
      } catch {
        // The next poll will re-sync the list either way.
      } finally {
        setLoading(false);
      }
    },
    [removeChallenge],
  );

  const createDuel = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.post<CreateDuelResponse>('/game/duel/create', { questionCount });
      setSessionId(res.sessionId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось создать дуэль');
    } finally {
      setLoading(false);
    }
  }, [questionCount]);

  const fetchJoinPreview = useCallback(async () => {
    if (inviteCodeInput.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const preview = await apiClient.get<DuelPreviewResponse>(
        `/game/duel/preview/${inviteCodeInput.toUpperCase()}`,
      );
      setJoinPreview(preview);
      setJoinQuestionCount(preview.questionCount);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Дуэль с таким кодом не найдена');
    } finally {
      setLoading(false);
    }
  }, [inviteCodeInput]);

  const confirmJoin = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.post<JoinDuelResponse>('/game/duel/join', {
        inviteCode: inviteCodeInput.toUpperCase(),
        questionCount: joinQuestionCount,
      });
      setSessionId(res.sessionId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось присоединиться к дуэли');
    } finally {
      setLoading(false);
    }
  }, [inviteCodeInput, joinQuestionCount]);

  const answer = useCallback(
    async (index: number) => {
      if (!sessionId || !duelState?.question || duelState.youAnswered || loading) return;
      setSelectedIndex(index);
      setLoading(true);
      setError(null);
      try {
        const state = await apiClient.post<DuelState>(`/game/duel/${sessionId}/answer`, {
          questionId: duelState.question.id,
          answerIndex: index,
        });
        setDuelState(state);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Не удалось отправить ответ');
        setSelectedIndex(null);
      } finally {
        setLoading(false);
      }
    },
    [sessionId, duelState, loading],
  );

  const next = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const state = await apiClient.post<DuelState>(`/game/duel/${sessionId}/next`);
      setDuelState(state);
      setSelectedIndex(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось продолжить');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Auto-advance ~5s after both players' answers are revealed, so the duel
  // doesn't stall waiting for someone to notice and click "Далее" — the
  // button still works too, for anyone who wants to move on sooner.
  useEffect(() => {
    if (!sessionId || !duelState?.roundResolved) return undefined;
    const timeout = setTimeout(() => void next(), 5000);
    return () => clearTimeout(timeout);
  }, [sessionId, duelState?.roundResolved, duelState?.questionNumber, next]);

  const reset = useCallback(() => {
    setSessionId(null);
    setActiveGame(null);
    setDuelState(null);
    setSelectedIndex(null);
    setError(null);
    setRewardsApplied(false);
    setJoinPreview(null);
    setInviteCodeInput('');
    setMenu('menu');
  }, [setActiveGame]);

  const copyInviteCode = useCallback(() => {
    if (duelState?.inviteCode) {
      void navigator.clipboard.writeText(duelState.inviteCode);
    }
  }, [duelState]);

  // --- Active duel views (session already created/joined) ---

  if (sessionId && duelState) {
    if (duelState.status === 'WAITING_FOR_OPPONENT') {
      return (
        <div className="mx-auto flex max-w-md flex-col items-center gap-5 px-4 pt-10 text-center">
          <h1 className="text-xl font-bold">Ожидание соперника…</h1>
          <p className="text-sm text-text-secondary">
            Отправьте этот код другу — он должен ввести его в разделе «Дуэль → Присоединиться»
          </p>
          <Card className="flex-col items-center gap-2 px-8 py-6">
            <p className="text-3xl font-bold tracking-[0.3em] text-primary">
              {duelState.inviteCode}
            </p>
          </Card>
          <Button onClick={copyInviteCode} variant="secondary" className="max-w-xs">
            Скопировать код
          </Button>
          <button onClick={reset} className="text-sm text-text-secondary">
            Отменить
          </button>
        </div>
      );
    }

    if (duelState.status === 'COMPLETED') {
      const outcomeLabel =
        duelState.outcome === 'win'
          ? 'Победа! 🎉'
          : duelState.outcome === 'loss'
            ? 'Поражение'
            : 'Ничья';
      const outcomeColor =
        duelState.outcome === 'win'
          ? 'text-success'
          : duelState.outcome === 'loss'
            ? 'text-danger'
            : 'text-text-primary';

      const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

      return (
        <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-10 text-center">
          <div className="flex flex-col items-center gap-2">
            <OilLampFlame size={80} />
            <h1 className={clsx('text-2xl font-bold', outcomeColor)}>{outcomeLabel}</h1>
            <p className="text-sm text-text-secondary text-balance">{completionPhrase}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Card className="flex-col items-center gap-1">
              <p className="text-xs text-text-secondary">Вы</p>
              <p className="text-2xl font-bold text-primary">
                {duelState.you.correctCount}/{duelState.questionCount}
              </p>
              <p className="text-xs text-text-muted">правильных</p>
            </Card>
            <Card className="flex-col items-center gap-1">
              <p className="text-xs text-text-secondary">
                {duelState.opponent?.nickname ?? 'Соперник'}
              </p>
              <p className="text-2xl font-bold">
                {duelState.opponent?.correctCount ?? 0}/{duelState.questionCount}
              </p>
              <p className="text-xs text-text-muted">правильных</p>
            </Card>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Card className="flex-col items-center">
              <p className="text-xs text-text-secondary">Знания</p>
              <p
                className={clsx(
                  'text-xl font-bold',
                  duelState.you.ratingDelta < 0 ? 'text-danger' : 'text-primary',
                )}
              >
                {signed(duelState.you.ratingDelta)}
              </p>
            </Card>
            <Card className="flex-col items-center">
              <p className="text-xs text-text-secondary">Опыт</p>
              <p className="text-xl font-bold text-primary">+{duelState.you.xpEarned}</p>
            </Card>
            <Card className="flex-col items-center">
              <p className="text-xs text-text-secondary">Монеты</p>
              <p className="text-xl font-bold text-primary">+{duelState.you.coinsEarned}</p>
            </Card>
          </div>

          {duelState.you.ratingCapped && (
            <p className="text-xs text-text-muted">
              Дневной лимит очков «Знаний» с побед в дуэлях достигнут — победа засчитана, но без
              очков. Завтра лимит обновится.
            </p>
          )}

          <Button onClick={reset}>Новая дуэль</Button>
          <Link href="/" className="text-center text-sm text-text-secondary">
            На главную
          </Link>
        </div>
      );
    }

    // IN_PROGRESS
    const { question } = duelState;
    if (!question) {
      return (
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-text-secondary">
          Загрузка…
        </div>
      );
    }

    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6">
        <div className="flex items-center justify-between text-sm">
          <div className="text-left">
            <p className="font-semibold">Вы</p>
            <p className="text-text-secondary">{duelState.you.score} очков</p>
          </div>
          <div className="text-center text-text-secondary">
            <p>
              Вопрос {duelState.questionNumber} из {duelState.questionCount}
            </p>
            <p className="text-xs">{duelState.secondsRemaining}с</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">{duelState.opponent?.nickname ?? 'Соперник'}</p>
            <p className="text-text-secondary">{duelState.opponent?.score ?? 0} очков</p>
          </div>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{
              width: `${
                ((duelState.timeLimitSeconds - (duelState.secondsRemaining ?? 0)) /
                  duelState.timeLimitSeconds) *
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
            const reveal = duelState.reveal;
            const isCorrectOption = reveal && index === reveal.correctIndex;
            const isMySelection = reveal
              ? reveal.you.selectedIndex === index
              : selectedIndex === index;
            const isWrongSelection = reveal && isMySelection && !reveal.you.isCorrect;

            return (
              <button
                key={index}
                onClick={() => answer(index)}
                disabled={duelState.youAnswered || loading}
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

        {error && <p className="text-sm text-danger">{error}</p>}

        {duelState.youAnswered && !duelState.roundResolved && (
          <p className="text-center text-sm text-text-secondary">Ждём ответа соперника…</p>
        )}

        {duelState.reveal && (
          <Card className="flex-col gap-2">
            <p className="text-sm text-text-secondary">{duelState.reveal.explanation}</p>
            <p className="text-xs text-text-muted">
              {duelState.reveal.verses
                ? `${duelState.reveal.book} ${duelState.reveal.verses}`
                : duelState.reveal.book}
            </p>
            <div className="flex justify-between text-sm">
              <span>Вы: +{duelState.reveal.you.scoreDelta}</span>
              <span>
                {duelState.opponent?.nickname ?? 'Соперник'}: +
                {duelState.reveal.opponent.scoreDelta}
              </span>
            </div>
            <Button onClick={next} className="mt-2" disabled={loading}>
              Далее
            </Button>
          </Card>
        )}
      </div>
    );
  }

  // --- Setup views (no active session yet) ---

  if (menu === 'create') {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-6">
        <h1 className="text-xl font-bold">Создать дуэль</h1>
        <Card className="flex-col gap-3">
          <QuestionCountSlider
            label="Количество вопросов"
            value={questionCount}
            min={DUEL_QUESTION_COUNT_MIN}
            max={DUEL_QUESTION_COUNT_MAX}
            onChange={setQuestionCount}
          />
        </Card>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button onClick={createDuel} disabled={loading}>
          {loading ? 'Создание…' : 'Создать дуэль'}
        </Button>
        <button onClick={() => setMenu('menu')} className="text-center text-sm text-text-secondary">
          Назад
        </button>
      </div>
    );
  }

  if (menu === 'join') {
    // Step 2: code accepted — the joiner can see the host's question count
    // and shrink it (never grow it) before actually starting the duel.
    if (joinPreview) {
      return (
        <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-6">
          <h1 className="text-xl font-bold">Присоединиться к дуэли</h1>
          <p className="text-sm text-text-secondary">
            Вызов от{' '}
            <span className="font-semibold text-text-primary">
              {joinPreview.hostNickname ?? 'соперника'}
            </span>
          </p>
          <Card className="flex-col gap-3">
            <QuestionCountSlider
              label="Количество вопросов"
              value={joinQuestionCount}
              min={DUEL_QUESTION_COUNT_MIN}
              max={joinPreview.questionCount}
              onChange={setJoinQuestionCount}
            />
            {joinQuestionCount < joinPreview.questionCount && (
              <p className="text-xs text-text-muted">
                Вы уменьшили дуэль с {joinPreview.questionCount} до {joinQuestionCount} вопросов
              </p>
            )}
          </Card>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button onClick={confirmJoin} disabled={loading}>
            {loading ? 'Подключение…' : 'Присоединиться'}
          </Button>
          <button
            onClick={() => setJoinPreview(null)}
            className="text-center text-sm text-text-secondary"
          >
            Назад
          </button>
        </div>
      );
    }

    // Step 1: enter the code.
    return (
      <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-6">
        <h1 className="text-xl font-bold">Присоединиться к дуэли</h1>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary">Код приглашения</span>
          <input
            value={inviteCodeInput}
            onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="ABCDEF"
            className="h-12 rounded-xl border border-border bg-surface px-4 text-center text-lg font-bold tracking-[0.3em] outline-none focus:border-primary"
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button onClick={fetchJoinPreview} disabled={loading || inviteCodeInput.length !== 6}>
          {loading ? 'Проверка…' : 'Далее'}
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
          <FriendsIcon className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Дуэль</h1>
          <p className="text-sm text-text-secondary">Сразитесь с другом в реальном времени</p>
        </div>
      </div>

      {pendingChallenges.length > 0 && (
        <Card className="flex-col gap-3">
          <p className="text-sm font-semibold text-text-secondary">Входящие вызовы</p>
          {pendingChallenges.map((challenge) =>
            respondingTo === challenge.sessionId ? (
              <div key={challenge.sessionId} className="flex flex-col gap-3">
                <p className="text-sm">
                  <span className="font-semibold">{challenge.fromNickname ?? 'Соперник'}</span>{' '}
                  бросает вам вызов
                </p>
                <QuestionCountSlider
                  label="Количество вопросов"
                  value={respondQuestionCount}
                  min={DUEL_QUESTION_COUNT_MIN}
                  max={challenge.questionCount}
                  onChange={setRespondQuestionCount}
                />
                {error && <p className="text-sm text-danger">{error}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={acceptChallenge}
                    disabled={loading}
                    className="h-10 flex-1 rounded-lg bg-primary text-sm font-semibold text-on-primary disabled:opacity-50"
                  >
                    {loading ? 'Подключение…' : 'Принять'}
                  </button>
                  <button
                    onClick={() => void declineChallenge(challenge.sessionId)}
                    disabled={loading}
                    className="h-10 flex-1 rounded-lg bg-surface-hover text-sm font-semibold text-text-secondary disabled:opacity-50"
                  >
                    Отклонить
                  </button>
                </div>
              </div>
            ) : (
              <div key={challenge.sessionId} className="flex items-center justify-between gap-2">
                <p className="truncate text-sm">
                  <span className="font-semibold">{challenge.fromNickname ?? 'Соперник'}</span> ·{' '}
                  {challenge.questionCount} вопросов
                </p>
                <button
                  onClick={() => startResponding(challenge)}
                  className="h-9 shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-on-primary"
                >
                  Ответить
                </button>
              </div>
            ),
          )}
        </Card>
      )}

      <Button onClick={() => setMenu('create')}>Создать дуэль</Button>
      <Button onClick={() => setMenu('join')} variant="secondary">
        Присоединиться по коду
      </Button>

      <Link href="/play" className="text-center text-sm text-text-secondary">
        Назад
      </Link>
    </div>
  );
}
