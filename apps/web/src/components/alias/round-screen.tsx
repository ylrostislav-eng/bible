'use client';

import { ALIAS_TEAM_COLORS, type AliasWordView } from '@bible-arena/shared';
import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { aliasFeedback } from '@/lib/alias/feedback';

/** С какой секунды таймер начинает щёлкать и краснеть. */
const URGENT_FROM_SECONDS = 10;

/** Насколько далеко нужно увести палец, чтобы это считалось жестом, а не
 * дрожанием руки. Пальцем в азарте промахиваются на десяток пикселей. */
const SWIPE_THRESHOLD_PX = 60;

interface RoundScreenProps {
  teamName: string;
  teamIndex: number;
  word: AliasWordView | null;
  /** Сколько уже угадано в этом раунде — единственная цифра, которая нужна
   * объясняющему прямо сейчас. */
  guessedCount: number;
  roundSeconds: number;
  soundEnabled: boolean;
  /** Раунд идёт в режиме «последнее слово»: таймер уже отзвонил. */
  lastWord: boolean;
  onAnswer: (guessed: boolean) => void;
  onTimeUp: () => void;
}

export function AliasRoundScreen({
  teamName,
  teamIndex,
  word,
  guessedCount,
  roundSeconds,
  soundEnabled,
  lastWord,
  onAnswer,
  onTimeUp,
}: RoundScreenProps) {
  const [secondsLeft, setSecondsLeft] = useState(roundSeconds);
  const [flash, setFlash] = useState<'guessed' | 'skipped' | null>(null);
  const [hintShown, setHintShown] = useState(false);
  const color = ALIAS_TEAM_COLORS[teamIndex % ALIAS_TEAM_COLORS.length];

  // Таймер считает от отметки времени, а не «минус единица в секунду»:
  // вкладка в фоне душит интервалы, и счётчик, доверяющий тикам, после
  // возврата показывает время, которого не было.
  // Отметку ставит эффект, а не рендер: `Date.now()` в теле компонента —
  // нечистый вызов, и при повторном рендере он даёт другое число.
  const startedAtRef = useRef<number>(0);
  const timeUpFiredRef = useRef(false);
  const lastTickRef = useRef<number>(roundSeconds);

  // Колбэк держим в ref, а не в зависимостях эффекта. Родитель пересоздаёт
  // его на каждый ответ, а эффект с ним в зависимостях перезапускал бы
  // таймер — то есть каждое угаданное слово начинало бы раунд заново.
  const onTimeUpRef = useRef(onTimeUp);
  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
  }, [onTimeUp]);

  useEffect(() => {
    if (lastWord) return undefined;
    // Начальное значение счётчика задано в `useState`: экран раунда
    // монтируется заново на каждый раунд, так что сбрасывать его здесь и
    // не нужно, и вредно — это лишний каскадный рендер.
    startedAtRef.current = Date.now();
    timeUpFiredRef.current = false;
    lastTickRef.current = roundSeconds;

    const id = window.setInterval(() => {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      const left = Math.max(0, Math.ceil(roundSeconds - elapsed));
      setSecondsLeft(left);

      if (left !== lastTickRef.current) {
        lastTickRef.current = left;
        if (left > 0 && left <= URGENT_FROM_SECONDS) aliasFeedback.tick(soundEnabled);
      }

      if (left === 0 && !timeUpFiredRef.current) {
        timeUpFiredRef.current = true;
        aliasFeedback.timeUp(soundEnabled);
        onTimeUpRef.current();
      }
    }, 100);

    return () => window.clearInterval(id);
  }, [roundSeconds, soundEnabled, lastWord]);

  const answer = useCallback(
    (guessed: boolean) => {
      if (!word) return;
      if (guessed) aliasFeedback.guessed(soundEnabled);
      else aliasFeedback.skipped(soundEnabled);
      setFlash(guessed ? 'guessed' : 'skipped');
      setHintShown(false);
      window.setTimeout(() => setFlash(null), 180);
      onAnswer(guessed);
    },
    [word, soundEnabled, onAnswer],
  );

  // Свайп вверх — угадали, вниз — пропуск. Жест быстрее кнопки и не требует
  // смотреть на экран, а кнопки остаются рядом для тех, кто про жест не
  // знает: показывать одно и то же двумя способами здесь не избыточность, а
  // разница между «понял сразу» и «затупил на весь раунд».
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    const dy = touch.clientY - start.y;
    const dx = touch.clientX - start.x;
    if (Math.abs(dy) < SWIPE_THRESHOLD_PX || Math.abs(dy) < Math.abs(dx)) return;
    answer(dy < 0);
  };

  const urgent = !lastWord && secondsLeft <= URGENT_FROM_SECONDS;
  const progress = lastWord ? 0 : Math.max(0, secondsLeft / roundSeconds);

  return (
    <div
      className="flex min-h-[100dvh] touch-none flex-col overscroll-none"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="h-1.5 w-full bg-surface">
        <div
          className={clsx(
            'h-full transition-[width] duration-100 ease-linear',
            urgent ? 'bg-danger' : 'bg-primary',
          )}
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <header className="flex items-center justify-between px-4 pt-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden
          />
          {teamName}
        </span>
        <span
          className={clsx(
            'text-2xl font-bold tabular-nums',
            urgent ? 'text-danger' : 'text-text-primary',
          )}
          aria-live="off"
        >
          {lastWord ? '0' : secondsLeft}
        </span>
        <span className="text-sm font-semibold text-success tabular-nums">+{guessedCount}</span>
      </header>

      {lastWord && (
        <p className="mt-3 text-center text-sm font-semibold uppercase tracking-wide text-primary">
          Последнее слово
        </p>
      )}

      <main
        className={clsx(
          'flex flex-1 flex-col items-center justify-center px-6 text-center transition-colors duration-150',
          flash === 'guessed' && 'bg-success/10',
          flash === 'skipped' && 'bg-danger/10',
        )}
      >
        {word ? (
          <>
            <p className="text-balance text-[clamp(2rem,11vw,3.25rem)] font-bold leading-tight">
              {word.word}
            </p>
            {hintShown ? (
              <p className="mt-4 max-w-xs text-sm text-text-secondary">{word.gloss}</p>
            ) : (
              // Кнопка для того, кто вытянул слово, которого сам не знает.
              // Без неё такой раунд просто сгорает, а человек чувствует себя
              // глупо — и это ровно та причина, по которой в игру больше не
              // садятся.
              <button
                type="button"
                onClick={() => setHintShown(true)}
                className="mt-5 rounded-full border border-border px-4 py-2 text-xs font-medium text-text-muted transition hover:border-text-muted hover:text-text-secondary"
              >
                Не знаю это слово
              </button>
            )}
          </>
        ) : (
          <p className="text-text-secondary">Слова закончились</p>
        )}
      </main>

      <div className="pb-safe grid grid-cols-2 gap-3 px-4 pb-4">
        <button
          type="button"
          // Свой звук: за нажатием сразу идёт «пропустили».
          data-no-sound
          onClick={() => answer(false)}
          className="flex h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-surface text-text-secondary transition active:scale-[0.98]"
        >
          <span className="text-2xl leading-none" aria-hidden>
            ↓
          </span>
          <span className="text-sm font-semibold">Пропустить</span>
        </button>
        <button
          type="button"
          // Свой звук: за нажатием сразу идёт «угадали».
          data-no-sound
          onClick={() => answer(true)}
          className="flex h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-success text-bg transition active:scale-[0.98]"
        >
          <span className="text-2xl leading-none" aria-hidden>
            ↑
          </span>
          <span className="text-sm font-semibold">Угадали</span>
        </button>
      </div>
    </div>
  );
}
