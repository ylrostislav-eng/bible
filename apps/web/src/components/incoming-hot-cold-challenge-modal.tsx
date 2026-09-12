'use client';

import type { PendingHotColdDuelInvite } from '@bible-arena/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useActiveGame } from '@/lib/active-game-context';
import { ApiError, apiClient } from '@/lib/api';
import { useIncomingHotColdChallenges } from '@/lib/incoming-hot-cold-challenges-context';
import { leaveActiveRoom } from '@/lib/leave-room';
import { LeaveRoomConfirm } from './leave-room-confirm';

/**
 * Полноэкранный попап личного вызова в «Горячо-холодно» — аналог
 * `DiceChallengePopup` и `ChallengePopup` для дуэли по вопросам. Тот же
 * приём: `targetUserId` на партии существовал с самого начала режима, но
 * увидеть вызов можно было, только зная код — здесь глобальный попап
 * решает ту же задачу, что и у остальных личных вызовов. Рисуется через
 * `IncomingNotifications`, который решает, чья очередь показываться.
 */
export function HotColdChallengePopup({
  challenge,
  onDismiss,
  queuedNote,
}: {
  challenge: PendingHotColdDuelInvite;
  onDismiss: () => void;
  /** Показывается под «Позже», когда за этим попапом ждёт ещё один. */
  queuedNote?: string;
}) {
  const router = useRouter();
  const { activeGame, setActiveGame } = useActiveGame();
  const { removeChallenge } = useIncomingHotColdChallenges();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Актуально, только пока сидишь в ещё не начатой комнате — комната в
  // игре уже глушит этот попап целиком (см. проверку в `IncomingNotifications`).
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const doAccept = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/hot-cold/duel/${challenge.duelId}/respond`, { action: 'ACCEPT' });
      removeChallenge(challenge.duelId);
      setActiveGame({
        type: 'hot-cold-duel',
        sessionId: challenge.duelId,
        status: 'READY_CHECK',
      });
      router.push('/hot-cold/duel');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось принять вызов');
      setBusy(false);
    }
  };

  const accept = () => {
    if (activeGame?.type === 'room') {
      setConfirmingLeave(true);
      return;
    }
    void doAccept();
  };

  const confirmLeaveAndAccept = async () => {
    if (!activeGame) return;
    setBusy(true);
    setError(null);
    try {
      await leaveActiveRoom(activeGame.sessionId);
    } catch {
      // Худший случай — старая комната повисит чуть дольше; вызов, ради
      // которого это делалось, всё равно стоит принять.
    }
    await doAccept();
  };

  const decline = async () => {
    setBusy(true);
    try {
      await apiClient.post(`/hot-cold/duel/${challenge.duelId}/respond`, { action: 'DECLINE' });
    } catch {
      // Убираем из списка в любом случае — устаревший отказ безвреден.
    } finally {
      removeChallenge(challenge.duelId);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-[calc(var(--safe-bottom)+7rem)] sm:items-center sm:pb-4"
      onClick={onDismiss}
    >
      <div
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-sm text-text-secondary">Вызов в «Горячо-холодно»</p>
          <p className="text-lg font-bold">{challenge.fromNickname ?? 'Игрок'}</p>
          <p className="text-xs text-text-muted">Одно слово на двоих — кто найдёт первым</p>
        </div>

        {confirmingLeave ? (
          <LeaveRoomConfirm
            onConfirm={() => void confirmLeaveAndAccept()}
            onCancel={() => setConfirmingLeave(false)}
            busy={busy}
            error={error}
          />
        ) : (
          <>
            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={accept}
                disabled={busy}
                className="h-11 flex-1 rounded-lg bg-primary text-sm font-semibold text-on-primary disabled:opacity-50"
              >
                {busy ? 'Садимся играть…' : 'Принять'}
              </button>
              <button
                onClick={() => void decline()}
                disabled={busy}
                className="h-11 flex-1 rounded-lg bg-surface-hover text-sm font-semibold text-text-secondary disabled:opacity-50"
              >
                Отклонить
              </button>
            </div>
          </>
        )}
        <button onClick={onDismiss} className="text-center text-xs text-text-secondary">
          Позже
        </button>
        {queuedNote && <p className="text-center text-xs text-text-secondary">{queuedNote}</p>}
      </div>
    </div>
  );
}
