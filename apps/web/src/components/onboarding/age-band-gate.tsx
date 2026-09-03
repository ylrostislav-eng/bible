'use client';

import type { AgeBand } from '@bible-arena/shared';
import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { AgeBandStep } from './age-band-step';

/**
 * Asks the age question once on accounts created before it existed.
 *
 * Blocking rather than a banner: the answer decides who can reach this
 * player, and a safety setting that everyone scrolls past is the same as
 * not having one. It's a single tap, and it's asked exactly once.
 */
export function AgeBandGate() {
  const { updateProfile } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(payload: { ageBand: AgeBand; guardianConfirmed: boolean }) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateProfile(payload);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pt-safe flex min-h-screen flex-col justify-center px-6 py-10">
      <AgeBandStep
        heading="Один вопрос перед игрой"
        subtitle="Мы добавили настройки безопасности. Укажите возраст — от него зависит, с кем можно играть и переписываться."
        submitLabel="Сохранить и играть"
        submitting={submitting}
        error={error}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
