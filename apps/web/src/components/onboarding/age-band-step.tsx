'use client';

import {
  AGE_BANDS,
  AGE_BAND_DESCRIPTIONS,
  AGE_BAND_LABELS,
  GUARDIAN_CONSENT_POINTS,
  type AgeBand,
} from '@bible-arena/shared';
import { useState } from 'react';
import { Button } from '../ui/button';

interface AgeBandStepProps {
  heading: string;
  subtitle: string;
  submitLabel: string;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (payload: { ageBand: AgeBand; guardianConfirmed: boolean }) => void | Promise<void>;
  onBack?: () => void;
}

/**
 * The one age question, shared by first-run onboarding and the catch-up
 * screen for accounts created before it existed.
 *
 * Picking "до 12" opens the guardian panel rather than saving straight
 * away. That panel is not a formality: an adult should see what the mode
 * actually does before the child is playing under it, and a child tapping
 * through alone should hit a step that visibly expects a grown-up.
 */
export function AgeBandStep({
  heading,
  subtitle,
  submitLabel,
  submitting = false,
  error,
  onSubmit,
  onBack,
}: AgeBandStepProps) {
  const [band, setBand] = useState<AgeBand | null>(null);
  const [guardianConfirmed, setGuardianConfirmed] = useState(false);

  const needsGuardian = band === 'CHILD';
  const canSubmit = band !== null && (!needsGuardian || guardianConfirmed);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">{heading}</h1>
        <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>
      </div>

      <div className="flex flex-col gap-2">
        {AGE_BANDS.map((option) => {
          const selected = band === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => {
                setBand(option);
                setGuardianConfirmed(false);
              }}
              aria-pressed={selected}
              className={`flex flex-col gap-0.5 rounded-2xl border px-4 py-3 text-left transition-colors ${
                selected
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-surface hover:bg-surface-hover'
              }`}
            >
              <span className="font-semibold">{AGE_BAND_LABELS[option]}</span>
              <span className="text-xs text-text-secondary">{AGE_BAND_DESCRIPTIONS[option]}</span>
            </button>
          );
        })}
      </div>

      {needsGuardian && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold">Этот шаг — для родителя</p>
          <ul className="flex flex-col gap-1.5">
            {GUARDIAN_CONSENT_POINTS.map((point) => (
              <li key={point} className="flex gap-2 text-xs leading-relaxed text-text-secondary">
                <span aria-hidden className="text-primary">
                  •
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={guardianConfirmed}
              onChange={(e) => setGuardianConfirmed(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
            />
            <span className="text-sm">
              Я родитель или законный представитель и разрешаю ребёнку играть на этих условиях
            </span>
          </label>
          <p className="text-xs text-text-secondary">
            Позже в настройках можно поставить родительский PIN-код, без которого детский режим
            нельзя будет отключить.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        {onBack && (
          <Button type="button" variant="secondary" onClick={onBack} className="flex-1">
            Назад
          </Button>
        )}
        <Button
          type="button"
          disabled={!canSubmit || submitting}
          className="flex-1"
          onClick={() => {
            if (!band) return;
            void onSubmit({ ageBand: band, guardianConfirmed });
          }}
        >
          {submitting ? 'Сохранение…' : submitLabel}
        </Button>
      </div>
    </div>
  );
}
