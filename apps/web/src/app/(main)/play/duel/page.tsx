'use client';

import type { CreateDuelResponse, DuelState, JoinDuelResponse } from '@bible-arena/shared';
import {
  DIFFICULTY_NAMES,
  DUEL_QUESTION_COUNT_OPTIONS,
  TESTAMENT_NAMES,
} from '@bible-arena/shared';
import clsx from 'clsx';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { FriendsIcon } from '@/components/icons/nav-icons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ApiError, apiClient } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const POLL_INTERVAL_MS = 1200;

type Menu = 'menu' | 'create' | 'join';

export default function DuelPage() {
  const { updateProfile } = useAuth();

  const [menu, setMenu] = useState<Menu>('menu');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [duelState, setDuelState] = useState<DuelState | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [, setRewardsApplied] = useState(false);

  useEffect(() => {
    if (!sessionId) return undefined;
    let cancelled = false;

    const poll = async () => {
      try {
        const state = await apiClient.get<DuelState>(`/game/duel/${sessionId}`);
        if (cancelled) return;
        setDuelState(state);
        if (state.status !== 'IN_PROGRESS' || state.youAnswered) {
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

  const joinDuel = useCallback(async () => {
    if (inviteCodeInput.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.post<JoinDuelResponse>('/game/duel/join', {
        inviteCode: inviteCodeInput.toUpperCase(),
      });
      setSessionId(res.sessionId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось присоединиться к дуэли');
    } finally {
      setLoading(false);
    }
  }, [inviteCodeInput]);

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
    setDuelState(null);
    setSelectedIndex(null);
    setError(null);
    setRewardsApplied(false);
    setMenu('menu');
  }, []);

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
          <h1 className={clsx('text-2xl font-bold', outcomeColor)}>{outcomeLabel}</h1>

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
            <span>{question.book}</span>
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
          <p className="text-sm font-medium text-text-secondary">Количество вопросов</p>
          <div className="grid grid-cols-3 gap-2">
            {DUEL_QUESTION_COUNT_OPTIONS.map((count) => (
              <button
                key={count}
                onClick={() => setQuestionCount(count)}
                className={clsx(
                  'h-11 rounded-xl border text-sm font-semibold transition',
                  count === questionCount
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-border bg-surface-hover text-text-primary',
                )}
              >
                {count}
              </button>
            ))}
          </div>
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
        <Button onClick={joinDuel} disabled={loading || inviteCodeInput.length !== 6}>
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
          <FriendsIcon className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Дуэль</h1>
          <p className="text-sm text-text-secondary">Сразитесь с другом в реальном времени</p>
        </div>
      </div>

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
