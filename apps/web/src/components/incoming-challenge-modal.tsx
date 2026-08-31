'use client';

import type { PendingChallenge } from '@bible-arena/shared';
import { DUEL_QUESTION_COUNT_MIN } from '@bible-arena/shared';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useActiveGame } from '@/lib/active-game-context';
import { ApiError, apiClient } from '@/lib/api';
import { useIncomingChallenges } from '@/lib/incoming-challenges-context';
import { QuestionCountSlider } from './ui/question-count-slider';

/** Set by this modal's "Перейти к дуэли" so the duel screen can pick the
 * freshly accepted session up on mount without a URL param. */
const PENDING_SESSION_STORAGE_KEY = 'bible-arena:pending-duel-session';

/**
 * A full-screen prompt for a friend-duel challenge that pops up no matter
 * where in the app the recipient currently is — mounted once at the (main)
 * layout level. Stays quiet while a game is already in progress (see
 * `IncomingChallengesProvider`) and while sitting on the duel screen itself,
 * since that page already shows its own inline "Входящие вызовы" list.
 */
export function IncomingChallengeModal() {
  const pathname = usePathname();
  const { activeGame } = useActiveGame();
  const { challenges } = useIncomingChallenges();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  if (activeGame || pathname === '/play/duel') return null;

  const challenge = challenges.find((c) => !dismissedIds.has(c.sessionId));
  if (!challenge) return null;

  return (
    <ChallengePopup
      key={challenge.sessionId}
      challenge={challenge}
      onDismiss={() =>
        setDismissedIds((ids) => {
          const next = new Set(ids);
          next.add(challenge.sessionId);
          return next;
        })
      }
    />
  );
}

function ChallengePopup({
  challenge,
  onDismiss,
}: {
  challenge: PendingChallenge;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const { setActiveGame } = useActiveGame();
  const { removeChallenge } = useIncomingChallenges();

  const [questionCount, setQuestionCount] = useState(challenge.questionCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiClient.post<{ sessionId: string }>(
        `/game/duel/${challenge.sessionId}/respond`,
        { action: 'ACCEPT', questionCount },
      );
      removeChallenge(challenge.sessionId);
      setActiveGame({ type: 'duel', sessionId: res.sessionId });
      sessionStorage.setItem(PENDING_SESSION_STORAGE_KEY, res.sessionId);
      router.push('/play/duel');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось принять вызов');
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    try {
      await apiClient.post(`/game/duel/${challenge.sessionId}/respond`, { action: 'DECLINE' });
    } catch {
      // Removing it from the list either way — a stale decline is harmless.
    } finally {
      removeChallenge(challenge.sessionId);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-28 sm:items-center sm:pb-4"
      onClick={onDismiss}
    >
      <div
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-sm text-text-secondary">Новый вызов на дуэль</p>
          <p className="text-lg font-bold">{challenge.fromNickname ?? 'Игрок'}</p>
        </div>

        <QuestionCountSlider
          label="Количество вопросов"
          value={questionCount}
          min={DUEL_QUESTION_COUNT_MIN}
          max={challenge.questionCount}
          onChange={setQuestionCount}
        />

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={() => void accept()}
            disabled={busy}
            className="h-11 flex-1 rounded-lg bg-primary text-sm font-semibold text-on-primary disabled:opacity-50"
          >
            {busy ? 'Подключение…' : 'Принять'}
          </button>
          <button
            onClick={() => void decline()}
            disabled={busy}
            className="h-11 flex-1 rounded-lg bg-surface-hover text-sm font-semibold text-text-secondary disabled:opacity-50"
          >
            Отклонить
          </button>
        </div>
        <button onClick={onDismiss} className="text-center text-xs text-text-muted">
          Позже
        </button>
      </div>
    </div>
  );
}
