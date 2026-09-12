'use client';

import type { PendingDiceInvite } from '@bible-arena/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useActiveGame } from '@/lib/active-game-context';
import { ApiError, apiClient } from '@/lib/api';
import { useIncomingDiceChallenges } from '@/lib/incoming-dice-challenges-context';
import { leaveActiveRoom } from '@/lib/leave-room';
import { LeaveRoomConfirm } from './leave-room-confirm';

/**
 * Полноэкранный попап личного вызова в «Кости» — аналог `ChallengePopup`
 * для дуэли, ровно то, чего не хватало по задаче #1: без него приглашение
 * было видно только тому, кто сам открыл экран «Кого пригласить?» в
 * костях, а всем остальным — никак. Рисуется через `IncomingNotifications`,
 * который решает, чья очередь показываться: одновременно на экране может
 * быть только один полноэкранный попап.
 *
 * Цель партии здесь не выбирается заново — её уже назначил тот, кто
 * позвал; меняется она только у дуэли, где спрашивается число вопросов.
 */
export function DiceChallengePopup({
  challenge,
  onDismiss,
  queuedNote,
}: {
  challenge: PendingDiceInvite;
  onDismiss: () => void;
  /** Показывается под «Позже», когда за этим попапом ждёт ещё один — как
   * у дуэли и комнаты: закрыть один не значит, что очередь закончилась. */
  queuedNote?: string;
}) {
  const router = useRouter();
  const { activeGame, setActiveGame } = useActiveGame();
  const { removeChallenge } = useIncomingDiceChallenges();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Актуально, только пока сидишь в ещё не начатой комнате — комната в
  // игре уже глушит этот попап целиком (см. проверку в `IncomingNotifications`).
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const doAccept = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/dice/${challenge.matchId}/respond`, { action: 'ACCEPT' });
      removeChallenge(challenge.matchId);
      setActiveGame({ type: 'dice', sessionId: challenge.matchId, status: 'IN_PROGRESS' });
      router.push('/play/dice');
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
      await apiClient.post(`/dice/${challenge.matchId}/respond`, { action: 'DECLINE' });
    } catch {
      // Убираем из списка в любом случае — устаревший отказ безвреден.
    } finally {
      removeChallenge(challenge.matchId);
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
          <p className="text-sm text-text-secondary">Вызов в «Кости»</p>
          <p className="text-lg font-bold">{challenge.fromNickname ?? 'Игрок'}</p>
          <p className="text-xs text-text-muted">Партия до {challenge.targetScore} очков</p>
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
                {busy ? 'Садимся за стол…' : 'Принять'}
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
