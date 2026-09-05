'use client';

import { MUSIC_VOLUME_DEFAULT, SOUND_VOLUME_MAX, SOUND_VOLUME_MIN } from '@bible-arena/shared';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

/**
 * Кнопка с нотой: громкость музыки с любого экрана.
 *
 * ## Зачем отдельная кнопка, а не только настройки
 *
 * Сначала музыка молчала там, где мы за игрока решили, что она мешает:
 * в чтении всегда, в партиях — по галочке в настройках. Отброшено.
 * Список экранов — это чужая догадка, и ошибается она в обе стороны:
 * кому-то музыка мешает читать, кому-то с ней читается лучше.
 *
 * Мешает музыка ровно в тот момент, когда она играет, — и решать надо
 * там же, не уходя с экрана в настройки и обратно. Отсюда кнопка: одно
 * нажатие до ползунка, второе — до тишины.
 *
 * ## Что здесь важно не сломать
 *
 * - **Кнопки не наезжают друг на друга.** Чат сидит справа внизу,
 *   приглашения — рядом с ним; музыка ушла налево. Отступ снизу у
 *   страницы (`AuthGate`) рассчитан на этот ряд.
 * - **Ползунок не блокируется на время сохранения.** Один раз на этом
 *   уже обожглись в настройках: поле гасло на время запроса, фокус
 *   слетал, и из четырёх нажатий стрелки доезжало одно.
 * - **Кнопки нет, когда музыка выключена совсем.** Ручка громкости у
 *   выключенной музыки — это предложение покрутить то, чего нет.
 */
export function MusicWidget() {
  const { user, updateProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [volume, setVolume] = useState(user?.musicVolume ?? MUSIC_VOLUME_DEFAULT);
  const [error, setError] = useState<string | null>(null);
  const dragging = useRef(false);

  // Профиль может приехать позже или измениться мимо ползунка — но не
  // перебивая то, что игрок как раз крутит рукой.
  useEffect(() => {
    if (user && !dragging.current) setVolume(user.musicVolume);
  }, [user]);

  // Сохраняем, когда ползунок замер, а не на каждое движение: один проход
  // от края до края — это иначе сотня запросов к серверу.
  useEffect(() => {
    if (!user || volume === user.musicVolume) {
      dragging.current = false;
      return;
    }
    dragging.current = true;
    const timer = setTimeout(() => {
      updateProfile({ musicVolume: volume })
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Не удалось сохранить'))
        .finally(() => {
          dragging.current = false;
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [volume, user, updateProfile]);

  if (!user?.musicEnabled) return null;

  const muted = volume === 0;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Громкость музыки"
        className="fixed bottom-24 left-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-surface text-text-primary shadow-lg ring-1 ring-border"
      >
        <NoteIcon muted={muted} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 left-4 z-30 w-64 rounded-2xl border border-border bg-surface p-4 shadow-2xl">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Музыка</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Свернуть"
          className="text-sm text-text-secondary"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-sm tabular-nums text-text-secondary">{volume}%</span>
        <input
          type="range"
          min={SOUND_VOLUME_MIN}
          max={SOUND_VOLUME_MAX}
          step={5}
          value={volume}
          aria-label="Громкость музыки"
          onChange={(e) => setVolume(Number(e.target.value))}
          className="flex-1 accent-primary"
        />
      </div>

      <button
        type="button"
        onClick={() => setVolume(muted ? MUSIC_VOLUME_DEFAULT : 0)}
        className="mt-3 w-full rounded-xl border border-border bg-surface-hover px-3 py-2 text-sm font-medium"
      >
        {muted ? 'Вернуть музыку' : 'Без музыки'}
      </button>

      {/* Выключить совсем — в настройках: тут быстрая ручка, а не второе
          место, где живёт то же самое. */}
      <p className="mt-2 text-xs text-text-muted">Отклики игры это не трогает — только музыку.</p>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}

function NoteIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
      <path
        d="M9 18V6l10-2v12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6.5" cy="18" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="16.5" cy="16" r="2.5" stroke="currentColor" strokeWidth="2" />
      {/* Перечёркнутая нота — состояние видно и без звука, и без цвета. */}
      {muted && <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}
