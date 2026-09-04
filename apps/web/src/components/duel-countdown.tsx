'use client';

import clsx from 'clsx';
import { useEffect, useState } from 'react';

/**
 * Обратный отсчёт до момента, когда слово сгорит.
 *
 * Считается от **серверного** времени, а не от часов устройства. Их
 * сбитость — не редкость, и без поправки игрок с неверными часами видел бы
 * «−40 секунд» или вечные двадцать.
 *
 * Сама шкала при этом ничего не решает: слово списывает сервер по своим
 * часам. Здесь только показ, и если он на полсекунды разойдётся с
 * действительностью, игра от этого не изменится.
 */
export function DuelCountdown({
  deadlineAt,
  serverNow,
  seconds,
}: {
  deadlineAt: string;
  /** Время сервера в момент, когда состояние ушло к нам. */
  serverNow: string;
  /** Сколько всего даётся на слово — чтобы нарисовать долю. */
  seconds: number;
}) {
  // Поправка на расхождение часов, снятая один раз при получении
  // состояния: дальше достаточно обычного local Date.now().
  const [skew] = useState(() => Date.parse(serverNow) - Date.now());
  const [left, setLeft] = useState(() => Math.max(0, Date.parse(deadlineAt) - (Date.now() + skew)));

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Date.parse(deadlineAt) - (Date.now() + skew)));
    tick();
    // Раз в сто миллисекунд, а не раз в секунду: полоска должна ехать, а
    // не прыгать. Числу хватило бы и секунды, полоске — нет.
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [deadlineAt, skew]);

  const share = Math.min(1, Math.max(0, left / (seconds * 1000)));
  const urgent = left <= 5000;

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-hover">
        <div
          className={clsx(
            'h-full rounded-full transition-[width] duration-100 ease-linear',
            urgent ? 'bg-danger' : 'bg-primary',
          )}
          style={{ width: `${share * 100}%` }}
        />
      </div>
      <span
        className={clsx(
          'w-8 shrink-0 text-right text-xs font-semibold tabular-nums',
          urgent ? 'text-danger' : 'text-text-muted',
        )}
        aria-label="Секунд на слово"
      >
        {Math.ceil(left / 1000)}
      </span>
    </div>
  );
}
