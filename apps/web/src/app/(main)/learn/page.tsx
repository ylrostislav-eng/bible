'use client';

import type {
  BibleChapterResponse,
  ChapterCheckQuestion,
  ChapterCheckSummary,
  StartChapterCheckResponse,
  StreakGoalDays,
  SubmitChapterCheckAnswerResult,
} from '@bible-arena/shared';
import { BIBLE_BOOKS } from '@bible-arena/shared';
import clsx from 'clsx';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LearnIcon } from '@/components/icons/nav-icons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CompletionHero } from '@/components/ui/completion-hero';
import { StreakSection } from '@/components/ui/streak-section';
import { ApiError, apiClient } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useSound } from '@/lib/sound';
import { useSyncProfileOnce } from '@/lib/use-sync-profile-once';

type View = 'books' | 'chapters' | 'reader';

const BOOKS_BY_ORDER = [...BIBLE_BOOKS].sort((a, b) => a.order - b.order);
const OLD_TESTAMENT_BOOKS = BOOKS_BY_ORDER.filter((b) => b.testament === 'OLD');
const NEW_TESTAMENT_BOOKS = BOOKS_BY_ORDER.filter((b) => b.testament === 'NEW');

function BooksView({ onSelectBook }: { onSelectBook: (bookId: number) => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-6">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface">
          <LearnIcon className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Изучение</h1>
          <p className="text-sm text-text-secondary">Синодальный перевод</p>
        </div>
      </div>

      {[
        { title: 'Ветхий Завет', books: OLD_TESTAMENT_BOOKS },
        { title: 'Новый Завет', books: NEW_TESTAMENT_BOOKS },
      ].map((section) => (
        <div key={section.title} className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-semibold text-text-secondary">{section.title}</h2>
          <Card className="flex-col gap-0.5 p-2">
            {section.books.map((book) => (
              <button
                key={book.id}
                onClick={() => onSelectBook(book.id)}
                className="flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium hover:bg-surface-hover"
              >
                <span>{book.name}</span>
                <span className="text-xs text-text-muted">{book.chapters} гл.</span>
              </button>
            ))}
          </Card>
        </div>
      ))}
    </div>
  );
}

function ChaptersView({
  bookId,
  onSelectChapter,
  onBack,
}: {
  bookId: number;
  onSelectChapter: (chapter: number) => void;
  onBack: () => void;
}) {
  const book = BIBLE_BOOKS.find((b) => b.id === bookId);
  if (!book) return null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-text-secondary"
          aria-label="Назад к книгам"
        >
          ←
        </button>
        <h1 className="text-lg font-bold">{book.name}</h1>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: book.chapters }, (_, i) => i + 1).map((chapter) => (
          <button
            key={chapter}
            onClick={() => onSelectChapter(chapter)}
            className="flex h-11 items-center justify-center rounded-xl border border-border bg-surface text-sm font-semibold text-text-primary hover:bg-surface-hover"
          >
            {chapter}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReaderView({
  bookId,
  chapter,
  onBackToChapters,
  onNavigate,
}: {
  bookId: number;
  chapter: number;
  onBackToChapters: () => void;
  onNavigate: (bookId: number, chapter: number) => void;
}) {
  const [data, setData] = useState<BibleChapterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get<BibleChapterResponse>(`/bible/${bookId}/${chapter}`);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Не удалось загрузить главу');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [bookId, chapter]);

  const goPrev = useCallback(() => {
    if (chapter > 1) {
      onNavigate(bookId, chapter - 1);
      return;
    }
    const bookIndex = BOOKS_BY_ORDER.findIndex((b) => b.id === bookId);
    const prevBook = BOOKS_BY_ORDER[bookIndex - 1];
    if (prevBook) onNavigate(prevBook.id, prevBook.chapters);
  }, [bookId, chapter, onNavigate]);

  const goNext = useCallback(() => {
    const book = BIBLE_BOOKS.find((b) => b.id === bookId);
    if (!book) return;
    if (chapter < book.chapters) {
      onNavigate(bookId, chapter + 1);
      return;
    }
    const bookIndex = BOOKS_BY_ORDER.findIndex((b) => b.id === bookId);
    const nextBook = BOOKS_BY_ORDER[bookIndex + 1];
    if (nextBook) onNavigate(nextBook.id, 1);
  }, [bookId, chapter, onNavigate]);

  const isVeryFirst = bookId === BOOKS_BY_ORDER[0].id && chapter === 1;
  const isVeryLast =
    bookId === BOOKS_BY_ORDER[BOOKS_BY_ORDER.length - 1].id &&
    chapter === BOOKS_BY_ORDER[BOOKS_BY_ORDER.length - 1].chapters;

  const [checking, setChecking] = useState(false);

  if (checking) {
    return (
      <ChapterCheckView
        bookId={bookId}
        chapter={chapter}
        bookName={data?.bookName ?? ''}
        onClose={() => setChecking(false)}
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6 pb-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onBackToChapters}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-text-secondary"
          aria-label="Назад к главам"
        >
          ←
        </button>
        <h1 className="text-lg font-bold">{data ? `${data.bookName} ${data.chapter}` : '…'}</h1>
      </div>

      {loading && <p className="text-center text-sm text-text-secondary">Загрузка…</p>}
      {error && <p className="text-center text-sm text-danger">{error}</p>}

      {data && (
        <Card className="flex-col gap-3">
          <p className="text-base leading-relaxed">
            {data.verses.map((v) => (
              <span key={v.verse}>
                <sup className="mr-1 text-xs font-semibold text-text-muted">{v.verse}</sup>
                {v.text}{' '}
              </span>
            ))}
          </p>
        </Card>
      )}

      {data && (
        <Button variant="secondary" onClick={() => setChecking(true)}>
          Пройти проверку
        </Button>
      )}

      <div className="flex gap-3">
        <button
          onClick={goPrev}
          disabled={isVeryFirst}
          className={clsx(
            'h-11 flex-1 rounded-xl border border-border bg-surface text-sm font-semibold',
            isVeryFirst ? 'opacity-40' : 'hover:bg-surface-hover',
          )}
        >
          ← Пред. глава
        </button>
        <button
          onClick={goNext}
          disabled={isVeryLast}
          className={clsx(
            'h-11 flex-1 rounded-xl border border-border bg-surface text-sm font-semibold',
            isVeryLast ? 'opacity-40' : 'hover:bg-surface-hover',
          )}
        >
          След. глава →
        </button>
      </div>
    </div>
  );
}

type CheckPhase = 'loading' | 'unavailable' | 'error' | 'question' | 'summary';

interface CheckFeedback {
  correct: boolean;
  correctIndex: number;
  explanation: string;
  timeExpired: boolean;
}

function ChapterCheckView({
  bookId,
  chapter,
  bookName,
  onClose,
}: {
  bookId: number;
  chapter: number;
  bookName: string;
  onClose: () => void;
}) {
  const { user, updateProfile } = useAuth();
  const { syncProfile, syncFailed: profileSyncFailed } = useSyncProfileOnce();
  const { play } = useSound();

  const [phase, setPhase] = useState<CheckPhase>('loading');
  const [settingGoal, setSettingGoal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [question, setQuestion] = useState<ChapterCheckQuestion | null>(null);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(20);
  const [secondsLeft, setSecondsLeft] = useState(20);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<CheckFeedback | null>(null);
  const [pendingNext, setPendingNext] = useState<ChapterCheckQuestion | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [summary, setSummary] = useState<ChapterCheckSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setPhase('loading');
      try {
        const res = await apiClient.post<StartChapterCheckResponse>('/learn/check/start', {
          bookId,
          chapter,
        });
        if (cancelled) return;
        setSessionId(res.sessionId);
        setTotalQuestions(res.totalQuestions);
        setQuestionNumber(res.questionNumber);
        setQuestion(res.question);
        setTimeLimitSeconds(res.timeLimitSeconds);
        setSecondsLeft(res.timeLimitSeconds);
        setPhase('question');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setPhase('unavailable');
        } else {
          setError(err instanceof ApiError ? err.message : 'Не удалось начать проверку');
          setPhase('error');
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
    };
  }, [bookId, chapter]);

  const submitAnswer = useCallback(
    async (index: number | undefined) => {
      if (!sessionId || !question || feedback || submitting) return;
      setSelectedIndex(index ?? null);
      setSubmitting(true);
      try {
        const res = await apiClient.post<SubmitChapterCheckAnswerResult>(
          `/learn/check/${sessionId}/answer`,
          {
            questionId: question.id,
            ...(index !== undefined ? { answerIndex: index } : {}),
            // Only matters on the last question (it's what the streak gets
            // evaluated against), but sending it every time is simpler than
            // knowing in advance which answer is the last one.
            timezoneOffsetMinutes: new Date().getTimezoneOffset(),
          },
        );
        setFeedback({
          correct: res.correct,
          correctIndex: res.correctIndex,
          explanation: res.explanation,
          timeExpired: res.timeExpired,
        });
        setCorrectCount(res.correctCount);
        setPendingNext(res.nextQuestion);
        // Сгоревшее время звучит не как ошибка: не ответил и ответил
        // неверно — разные вещи, и путать их обидно.
        play(res.timeExpired ? 'burnt' : res.correct ? 'correct' : 'wrong');
        if (res.finished && res.summary) {
          setSummary(res.summary);
          // Refresh the cached profile so Profile reflects the new streak/rating.
          syncProfile();
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Не удалось отправить ответ');
        setPhase('error');
      } finally {
        setSubmitting(false);
      }
    },
    [sessionId, question, feedback, submitting, syncProfile, play],
  );

  const setStreakGoal = useCallback(
    async (days: StreakGoalDays) => {
      setSettingGoal(true);
      try {
        await apiClient.patch('/users/me/streak-goal', { days });
        await updateProfile({});
      } catch {
        // Non-critical — the goal picker just stays put for another try.
      } finally {
        setSettingGoal(false);
      }
    },
    [updateProfile],
  );

  useEffect(() => {
    if (phase !== 'question' || feedback) return;
    if (secondsLeft <= 0) {
      const timeout = setTimeout(() => void submitAnswer(undefined), 0);
      return () => clearTimeout(timeout);
    }
    // Тик только на последних пяти секундах — ровно там, где на экране
    // уже краснеет счётчик. Тикать всю минуту значит превратить отклик в
    // фон, который перестают слышать.
    if (secondsLeft <= 5) play('tick');
    const timeout = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timeout);
  }, [phase, feedback, secondsLeft, submitAnswer, play]);

  const continueCheck = useCallback(async () => {
    if (summary) {
      setPhase('summary');
      play('reward');
      return;
    }
    if (!pendingNext || !sessionId) return;
    try {
      // Starts the server-side timer for the next question only now — not
      // back when the previous answer was graded — so reading the
      // explanation doesn't eat into the next question's time budget.
      await apiClient.post(`/learn/check/${sessionId}/advance`, {});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось продолжить проверку');
      setPhase('error');
      return;
    }
    setQuestion(pendingNext);
    setPendingNext(null);
    setQuestionNumber((n) => n + 1);
    setSelectedIndex(null);
    setFeedback(null);
    setSecondsLeft(timeLimitSeconds);
  }, [summary, pendingNext, timeLimitSeconds, sessionId, play]);

  if (phase === 'loading') {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-10 text-center">
        <p className="text-sm text-text-secondary">Загрузка проверки…</p>
      </div>
    );
  }

  if (phase === 'unavailable') {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-10 text-center">
        <p className="text-sm text-text-secondary">Для этой главы пока нет проверочных вопросов.</p>
        <Button onClick={onClose}>Назад к чтению</Button>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-10 text-center">
        <p className="text-sm text-danger">{error}</p>
        <Button onClick={onClose}>Назад к чтению</Button>
      </div>
    );
  }

  if (phase === 'summary' && summary) {
    const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
    return (
      <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-10 text-center">
        <CompletionHero
          correctCount={summary.correctCount}
          totalQuestions={summary.totalQuestions}
        />
        <p className="text-text-secondary">
          Правильных ответов: {summary.correctCount} из {summary.totalQuestions}
        </p>

        {!summary.pointsAwarded && (
          <Card className="flex-col items-center gap-1 border-primary/40 bg-primary/5">
            <p className="text-sm text-text-secondary">
              Очки за эту главу уже начислялись на этой неделе — это была тренировка. Попробуй ещё
              раз через несколько дней.
            </p>
          </Card>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Card className="flex-col items-center">
            <p className="text-xs text-text-secondary">Знания</p>
            <p
              className={clsx(
                'text-xl font-bold',
                summary.ratingEarned < 0 ? 'text-danger' : 'text-primary',
              )}
            >
              {signed(summary.ratingEarned)}
            </p>
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

        <StreakSection
          current={summary.streak.current}
          longest={summary.streak.longest}
          goalDays={user?.streakGoalDays ?? summary.streak.goalDays}
          goalRewarded={user?.streakGoalRewarded ?? false}
          goalReachedNow={summary.streak.goalReachedNow}
          goalCoinsEarned={summary.streak.goalCoinsEarned}
          onSetGoal={setStreakGoal}
          settingGoal={settingGoal}
        />
        {profileSyncFailed && (
          <p className="text-xs text-text-muted">
            Награда сохранена, но профиль не успел обновиться — актуальные цифры появятся при
            следующем заходе в приложение.
          </p>
        )}

        <Button onClick={onClose}>Готово</Button>
      </div>
    );
  }

  if (!question) return null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6">
      <div className="flex items-center justify-between text-sm text-text-secondary">
        <span>
          {bookName} {chapter} — вопрос {questionNumber} из {totalQuestions}
        </span>
        <span className="flex items-center gap-3">
          <span>Верно: {correctCount}</span>
          <span className={clsx('font-semibold', secondsLeft <= 5 && !feedback && 'text-danger')}>
            ⏱ {secondsLeft}с
          </span>
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${(questionNumber / totalQuestions) * 100}%` }}
        />
      </div>

      <Card className="flex-col gap-2">
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
              // Свой звук: сразу за нажатием придёт «верно»/«неверно».
              data-no-sound
              onClick={() => submitAnswer(index)}
              disabled={selectedIndex !== null || submitting || !!feedback}
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

      {feedback && (
        <Card className="flex-col gap-2">
          <p className={clsx('font-semibold', feedback.correct ? 'text-success' : 'text-danger')}>
            {feedback.timeExpired ? 'Время вышло' : feedback.correct ? 'Правильно!' : 'Неверно'}
          </p>
          <p className="text-sm text-text-secondary">{feedback.explanation}</p>
          <Button onClick={continueCheck} className="mt-2">
            {summary ? 'Смотреть результат' : 'Далее'}
          </Button>
        </Card>
      )}
    </div>
  );
}

/** Разбирает `/learn?book=1&chapter=3` — ссылку на конкретную главу.
 * Проверяет и номер книги, и что такая глава в ней есть: подсунутый в адрес
 * мусор должен открыть список книг, а не пустую читалку. */
function readChapterFromQuery(params: URLSearchParams): { bookId: number; chapter: number } | null {
  const bookId = Number(params.get('book'));
  const chapter = Number(params.get('chapter'));
  if (!Number.isInteger(bookId) || !Number.isInteger(chapter)) return null;
  const book = BIBLE_BOOKS.find((item) => item.id === bookId);
  if (!book || chapter < 1 || chapter > book.chapters) return null;
  return { bookId, chapter };
}

export default function LearnPage() {
  const searchParams = useSearchParams();
  // Ссылка на главу приходит снаружи — из разбора раунда в Alias, из
  // будущих подсказок и уведомлений. Читаем её один раз при входе: дальше
  // читалка живёт своим состоянием, и переписывать его под адресную строку
  // на каждом перелистывании значило бы ломать кнопку «назад».
  const initial = useMemo(
    () => readChapterFromQuery(new URLSearchParams(searchParams.toString())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [view, setView] = useState<View>(initial ? 'reader' : 'books');
  const [bookId, setBookId] = useState<number | null>(initial?.bookId ?? null);
  const [chapter, setChapter] = useState<number | null>(initial?.chapter ?? null);

  if (view === 'chapters' && bookId !== null) {
    return (
      <ChaptersView
        bookId={bookId}
        onSelectChapter={(c) => {
          setChapter(c);
          setView('reader');
        }}
        onBack={() => setView('books')}
      />
    );
  }

  if (view === 'reader' && bookId !== null && chapter !== null) {
    return (
      <ReaderView
        bookId={bookId}
        chapter={chapter}
        onBackToChapters={() => setView('chapters')}
        onNavigate={(nextBookId, nextChapter) => {
          setBookId(nextBookId);
          setChapter(nextChapter);
        }}
      />
    );
  }

  return (
    <BooksView
      onSelectBook={(id) => {
        setBookId(id);
        setView('chapters');
      }}
    />
  );
}
