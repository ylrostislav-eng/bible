'use client';

import type {
  GameQuestion,
  GameSummary,
  StartSoloGameResponse,
  SubmitAnswerResult,
} from '@bible-arena/shared';
import {
  DIFFICULTY_NAMES,
  SOLO_QUESTION_COUNT_OPTIONS,
  TESTAMENT_NAMES,
} from '@bible-arena/shared';
import clsx from 'clsx';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { PlayIcon } from '@/components/icons/nav-icons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CompletionHero } from '@/components/ui/completion-hero';
import { ApiError, apiClient } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

type Phase = 'setup' | 'question' | 'summary';

interface Feedback {
  correct: boolean;
  correctIndex: number;
  explanation: string;
  book: string;
  chapter: number | null;
  verses: string | null;
}

export default function PlayPage() {
  const { updateProfile } = useAuth();

  const [phase, setPhase] = useState<Phase>('setup');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [correctCount, setCorrectCount] = useState(0);
  const [question, setQuestion] = useState<GameQuestion | null>(null);
  const [pendingNext, setPendingNext] = useState<GameQuestion | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [summary, setSummary] = useState<GameSummary | null>(null);
  const [questionStartedAt, setQuestionStartedAt] = useState(0);

  const startGame = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.post<StartSoloGameResponse>('/game/solo/start', {
        questionCount,
      });
      setSessionId(res.sessionId);
      setTotalQuestions(res.totalQuestions);
      setQuestionNumber(res.questionNumber);
      setQuestion(res.question);
      setPendingNext(null);
      setCorrectCount(0);
      setSelectedIndex(null);
      setFeedback(null);
      setSummary(null);
      setQuestionStartedAt(Date.now());
      setPhase('question');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось начать игру');
    } finally {
      setLoading(false);
    }
  }, [questionCount]);

  const selectAnswer = useCallback(
    async (index: number) => {
      if (!sessionId || !question || selectedIndex !== null || loading) return;

      setSelectedIndex(index);
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.post<SubmitAnswerResult>(`/game/solo/${sessionId}/answer`, {
          questionId: question.id,
          answerIndex: index,
          timeTakenMs: Date.now() - questionStartedAt,
        });
        setFeedback({
          correct: res.correct,
          correctIndex: res.correctIndex,
          explanation: res.explanation,
          book: res.book,
          chapter: res.chapter,
          verses: res.verses,
        });
        setCorrectCount(res.correctCount);
        setPendingNext(res.nextQuestion);
        if (res.finished && res.summary) {
          setSummary(res.summary);
          // Refresh the cached profile so Home/Profile reflect the new
          // level/coins/XP/gamesPlayed without a full reload.
          void updateProfile({});
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Не удалось отправить ответ');
        setSelectedIndex(null);
      } finally {
        setLoading(false);
      }
    },
    [sessionId, question, selectedIndex, loading, questionStartedAt, updateProfile],
  );

  const continueGame = useCallback(() => {
    if (summary) {
      setPhase('summary');
      return;
    }
    if (!pendingNext) return;
    setQuestion(pendingNext);
    setPendingNext(null);
    setQuestionNumber((n) => n + 1);
    setSelectedIndex(null);
    setFeedback(null);
    setQuestionStartedAt(Date.now());
  }, [summary, pendingNext]);

  const playAgain = useCallback(() => {
    setPhase('setup');
    setSessionId(null);
    setQuestion(null);
    setSummary(null);
    setFeedback(null);
    setError(null);
  }, []);

  if (phase === 'setup') {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface">
            <PlayIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Одиночная игра</h1>
            <p className="text-sm text-text-secondary">Проверьте свои знания Библии</p>
          </div>
        </div>

        <Card className="flex-col gap-3">
          <p className="text-sm font-medium text-text-secondary">Количество вопросов</p>
          <div className="grid grid-cols-4 gap-2">
            {SOLO_QUESTION_COUNT_OPTIONS.map((count) => (
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

        <Button onClick={startGame} disabled={loading}>
          {loading ? 'Загрузка…' : 'Начать игру'}
        </Button>

        <Link href="/" className="text-center text-sm text-text-secondary">
          На главную
        </Link>
      </div>
    );
  }

  if (phase === 'summary' && summary) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-10 text-center">
        <CompletionHero
          correctCount={summary.correctCount}
          totalQuestions={summary.totalQuestions}
        />
        <p className="text-text-secondary">
          Правильных ответов: {summary.correctCount} из {summary.totalQuestions}
        </p>

        <div className="grid grid-cols-3 gap-3">
          <Card className="flex-col items-center">
            <p className="text-xs text-text-secondary">Очки</p>
            <p className="text-xl font-bold text-primary">{summary.score}</p>
          </Card>
          <Card className="flex-col items-center">
            <p className="text-xs text-text-secondary">Опыт</p>
            <p className="text-xl font-bold text-primary">+{summary.xpEarned}</p>
          </Card>
          <Card className="flex-col items-center">
            <p className="text-xs text-text-secondary">Монеты</p>
            <p className="text-xl font-bold text-primary">+{summary.coinsEarned}</p>
          </Card>
        </div>

        {summary.leveledUp && (
          <Card className="flex-col items-center border-primary">
            <p className="font-semibold text-primary">Новый уровень: {summary.level}! 🎉</p>
          </Card>
        )}

        <Button onClick={playAgain}>Играть снова</Button>
        <Link href="/" className="text-center text-sm text-text-secondary">
          На главную
        </Link>
      </div>
    );
  }

  if (!question) return null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6">
      <div className="flex items-center justify-between text-sm text-text-secondary">
        <span>
          Вопрос {questionNumber} из {totalQuestions}
        </span>
        <span>Верно: {correctCount}</span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${(questionNumber / totalQuestions) * 100}%` }}
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
          const isSelected = selectedIndex === index;
          const isCorrectOption = feedback && index === feedback.correctIndex;
          const isWrongSelected = feedback && isSelected && !feedback.correct;

          return (
            <button
              key={index}
              onClick={() => selectAnswer(index)}
              disabled={selectedIndex !== null || loading}
              className={clsx(
                'flex h-14 items-center rounded-xl border px-4 text-left text-sm font-medium transition disabled:cursor-not-allowed',
                !feedback && 'border-border bg-surface hover:bg-surface-hover',
                feedback && isCorrectOption && 'border-success bg-success/10 text-success',
                feedback && isWrongSelected && 'border-danger bg-danger/10 text-danger',
                feedback &&
                  !isCorrectOption &&
                  !isWrongSelected &&
                  'border-border bg-surface text-text-muted',
              )}
            >
              {option}
            </button>
          );
        })}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {feedback && (
        <Card className="flex-col gap-2">
          <p className={clsx('font-semibold', feedback.correct ? 'text-success' : 'text-danger')}>
            {feedback.correct ? 'Правильно!' : 'Неверно'}
          </p>
          <p className="text-sm text-text-secondary">{feedback.explanation}</p>
          <p className="text-xs text-text-muted">
            {feedback.verses
              ? `${feedback.book} ${feedback.verses}`
              : feedback.chapter
                ? `${feedback.book} ${feedback.chapter}`
                : feedback.book}
          </p>
          <Button onClick={continueGame} className="mt-2">
            {summary ? 'Смотреть результат' : 'Далее'}
          </Button>
        </Card>
      )}
    </div>
  );
}
