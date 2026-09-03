'use client';

import {
  QUESTION_PACES,
  QUESTION_PACE_DESCRIPTIONS,
  QUESTION_PACE_LABELS,
  TEXT_SCALES,
  TEXT_SCALE_LABELS,
  type QuestionPace,
  type TextScale,
} from '@bible-arena/shared';
import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

/**
 * The two settings that decide whether the app is usable at all for the
 * youngest and the oldest players — the timer and the type size.
 *
 * Kept together in one card because they solve the same problem from two
 * directions: a person who reads slowly is fighting both.
 */
export function ReadingComfortSection() {
  const { user, updateProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  async function save(patch: { questionPace?: QuestionPace; textScale?: TextScale }) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile(patch);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4">
      <div>
        <h2 className="font-semibold">Удобство чтения</h2>
        <p className="mt-0.5 text-sm text-text-secondary">
          Чтобы игра не превращалась в проверку скорости чтения.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-text-secondary">Время на вопрос</p>
        {QUESTION_PACES.map((pace) => (
          <button
            key={pace}
            type="button"
            disabled={saving}
            aria-pressed={user.questionPace === pace}
            onClick={() => void save({ questionPace: pace })}
            className={`flex flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
              user.questionPace === pace
                ? 'border-primary bg-primary/10'
                : 'border-border bg-surface-hover'
            }`}
          >
            <span className="text-sm font-medium">{QUESTION_PACE_LABELS[pace]}</span>
            <span className="text-xs text-text-secondary">{QUESTION_PACE_DESCRIPTIONS[pace]}</span>
          </button>
        ))}
        {/* Said plainly, because otherwise the setting looks broken the
            first time someone starts a duel and the clock is back. */}
        <p className="text-xs text-text-secondary">
          Действует в режиме «Изучение». В дуэлях и комнатах таймер общий для всех игроков, поэтому
          там он не меняется.
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <p className="text-sm font-medium text-text-secondary">Размер текста</p>
        <div className="grid grid-cols-3 gap-2">
          {TEXT_SCALES.map((scale) => (
            <button
              key={scale}
              type="button"
              disabled={saving}
              aria-pressed={user.textScale === scale}
              onClick={() => void save({ textScale: scale })}
              className={`rounded-xl border px-2 py-2.5 text-center transition-colors disabled:opacity-50 ${
                user.textScale === scale
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-surface-hover'
              }`}
            >
              <span className="text-sm font-medium">{TEXT_SCALE_LABELS[scale]}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}
