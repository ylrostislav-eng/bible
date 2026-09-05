'use client';

import {
  DAILY_WORD_HINT_LABELS,
  DAILY_WORD_MAX_ATTEMPTS,
  dailyWordShareText,
  type DailyWordFriendsResponse,
  type DailyWordGuessResult,
  type DailyWordState,
} from '@bible-arena/shared';
import clsx from 'clsx';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackLink } from '@/components/ui/back-link';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ApiError, apiClient } from '@/lib/api';
import { pluralCoins } from '@/lib/plural';
import { useSound } from '@/lib/sound';

export default function DailyWordPage() {
  const { play } = useSound();
  const [state, setState] = useState<DailyWordState | null>(null);
  const [friends, setFriends] = useState<DailyWordFriendsResponse | null>(null);
  const [guess, setGuess] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Последний неверный ответ — чтобы сказать «не то» про конкретное слово,
   * а не безлико. */
  const [lastWrong, setLastWrong] = useState<{ value: string; near: boolean } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<DailyWordState>('/daily-word')
      .then((response) => {
        if (!cancelled) setState(response);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : 'Не удалось загрузить слово дня');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadFriends = useCallback(() => {
    apiClient
      .get<DailyWordFriendsResponse>('/daily-word/friends')
      .then(setFriends)
      .catch(() => setFriends(null));
  }, []);

  // Результаты друзей грузим только когда день закрыт: до этого они не
  // нужны, а лишний запрос на каждом открытии экрана — нужен ещё меньше.
  useEffect(() => {
    if (state?.finished) loadFriends();
  }, [state?.finished, loadFriends]);

  const submit = useCallback(async () => {
    const value = guess.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiClient.post<DailyWordGuessResult>('/daily-word/guess', {
        guess: value,
      });
      setState(result.state);
      setGuess('');
      setLastWrong(result.correct ? null : { value, near: result.near === true });
      // Разгаданное слово дня — это ещё и награда, а не просто «верно».
      play(result.correct ? 'reward' : 'wrong');
      if (!result.correct) inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось отправить ответ');
    } finally {
      setBusy(false);
    }
  }, [guess, busy, play]);

  const takeHint = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setState(await apiClient.post<DailyWordState>('/daily-word/hint', {}));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось взять подсказку');
    } finally {
      setBusy(false);
    }
  }, [busy]);

  if (loadError) {
    return (
      <div className="mx-auto max-w-md px-4 pt-10 text-center">
        <p className="text-sm text-danger">{loadError}</p>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex justify-center pt-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-6">
      <header className="flex items-start gap-3">
        <BackLink href="/" label="Назад на главную" />
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-text-muted">
            {formatDate(state.date)}
          </p>
          <h1 className="text-2xl font-bold">Слово дня</h1>
          <p className="mt-1 text-sm text-text-secondary">Одно на всех. Угадайте по описанию.</p>
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-lg leading-snug">{state.gloss}</p>
      </section>

      {state.hints.length > 0 && (
        <ul className="flex flex-col gap-2">
          {state.hints.map((hint, index) => (
            <li
              key={index}
              className="flex items-baseline gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
            >
              <span className="shrink-0 text-[11px] uppercase tracking-wide text-text-muted">
                {DAILY_WORD_HINT_LABELS[hint.kind]}
              </span>
              {hint.reference ? (
                <Link
                  href={`/learn?book=${hint.reference.bookId}&chapter=${hint.reference.chapter}`}
                  className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
                >
                  {hint.text} →
                </Link>
              ) : (
                <span className="text-sm font-semibold">{hint.text}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {state.finished ? (
        <FinishedCard state={state} friends={friends} />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <input
              ref={inputRef}
              value={guess}
              onChange={(event) => setGuess(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit();
              }}
              maxLength={64}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Ваш ответ"
              aria-label="Ответ"
              className="h-12 rounded-xl border border-border bg-surface px-4 text-base outline-none transition focus:border-primary"
            />
            {lastWrong && (
              <p
                className={clsx('text-sm', lastWrong.near ? 'text-primary' : 'text-text-secondary')}
                aria-live="polite"
              >
                {lastWrong.near
                  ? `«${lastWrong.value}» — почти, но слово другой длины.`
                  : `«${lastWrong.value}» — не то.`}{' '}
                {state.attemptsLeft > 0
                  ? `Осталось ${state.attemptsLeft} ${pluralAttempts(state.attemptsLeft)}`
                  : ''}
              </p>
            )}
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button onClick={() => void submit()} disabled={busy || guess.trim().length === 0}>
              {busy ? <Spinner /> : 'Ответить'}
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {state.hintsLeft > 0 ? 'Взять подсказку' : 'Подсказок больше нет'}
              </p>
              {/* Цена подсказки показана заранее, а не после нажатия: иначе
                  человек узнаёт о потере очков постфактум, и это ощущается
                  как обман, даже если всё честно. */}
              <p className="text-xs text-text-muted">
                Сейчас за ответ {state.rewardIfSolvedNow.xp} XP
                {state.hintsLeft > 0 ? ', с подсказкой — меньше' : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void takeHint()}
              disabled={busy || state.hintsLeft === 0}
              className="shrink-0 rounded-xl bg-surface-hover px-4 py-2 text-sm font-semibold transition hover:bg-border disabled:opacity-40"
            >
              Подсказка
            </button>
          </div>

          <AttemptDots used={state.attemptsUsed} />
        </>
      )}
    </div>
  );
}

function FinishedCard({
  state,
  friends,
}: {
  state: DailyWordState;
  friends: DailyWordFriendsResponse | null;
}) {
  const shareText = dailyWordShareText({
    solved: state.solved,
    hintsUsed: state.hints.length,
    attemptsUsed: state.attemptsUsed,
  });
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Буфер обмена может быть недоступен — молча, текст и так на экране.
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section
        className={clsx(
          'rounded-2xl border p-4 text-center',
          state.solved ? 'border-success/40 bg-success/10' : 'border-border bg-surface',
        )}
      >
        <p className="text-sm text-text-secondary">
          {state.solved ? 'Верно' : 'Слово дня сегодня не поддалось'}
        </p>
        <p className="mt-1 text-3xl font-bold">{state.word}</p>
        {state.reference && (
          <Link
            href={`/learn?book=${state.reference.bookId}&chapter=${state.reference.chapter}`}
            className="mt-2 inline-block text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            {state.reference.label} →
          </Link>
        )}
        {state.earned && (
          <p className="mt-3 text-sm font-semibold text-success">
            +{state.earned.xp} XP · +{state.earned.coins} {pluralCoins(state.earned.coins)}
          </p>
        )}
      </section>

      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm text-text-secondary">{shareText}</p>
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-xl bg-surface-hover px-3 py-2 text-xs font-semibold transition hover:bg-border"
        >
          {copied ? 'Скопировано' : 'Скопировать'}
        </button>
      </div>

      {friends && friends.friends.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
            Сегодня у друзей
          </h2>
          <ul className="flex flex-col gap-2">
            {friends.friends.map((friend) => (
              <li
                key={friend.userId}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  {friend.nickname ?? 'Без имени'}
                </span>
                <span className="shrink-0 text-xs text-text-secondary">
                  {friend.attemptsUsed === null
                    ? 'ещё думает'
                    : friend.solved
                      ? `угадал${friend.hintsUsed === 0 ? ' без подсказок' : `, подсказок: ${friend.hintsUsed}`}`
                      : 'не угадал'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Тот же тупик, что был в «Горячо-холодно»: день закрыт, а куда
          идти — не сказано. */}
      <section className="flex flex-col gap-2 border-t border-border pt-4">
        <p className="text-center text-xs text-text-muted">
          Слово одно на всех и меняется в полночь — переиграть его нельзя.
        </p>
        <div className="flex gap-2">
          <Link
            href="/hot-cold"
            className="flex-1 rounded-xl bg-surface-hover px-3 py-2.5 text-center text-sm font-semibold transition hover:bg-border"
          >
            Горячо-холодно
          </Link>
          <Link
            href="/play"
            className="flex-1 rounded-xl bg-surface-hover px-3 py-2.5 text-center text-sm font-semibold transition hover:bg-border"
          >
            Другие игры
          </Link>
        </div>
      </section>
    </div>
  );
}

/** Точки вместо числа: сколько попыток потрачено, видно одним взглядом и
 * без чтения. */
function AttemptDots({ used }: { used: number }) {
  return (
    <div
      className="flex items-center justify-center gap-2"
      aria-label={`Попыток: ${used} из ${DAILY_WORD_MAX_ATTEMPTS}`}
    >
      {Array.from({ length: DAILY_WORD_MAX_ATTEMPTS }, (_, index) => (
        <span
          key={index}
          className={clsx(
            'h-2 w-2 rounded-full transition-colors',
            index < used ? 'bg-danger' : 'bg-surface-hover',
          )}
        />
      ))}
    </div>
  );
}

function pluralAttempts(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'попытка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'попытки';
  return 'попыток';
}

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/** `2026-09-04` → «4 сентября». Дата приходит уже локальной для игрока, так
 * что разбираем её как есть, без часовых поясов. */
function formatDate(iso: string): string {
  const [, month, day] = iso.split('-').map(Number);
  return `${day} ${MONTHS[month - 1] ?? ''}`;
}
