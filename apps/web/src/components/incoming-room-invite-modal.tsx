'use client';

import type { RoomInviteView } from '@bible-arena/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useActiveGame } from '@/lib/active-game-context';
import { ApiError, apiClient } from '@/lib/api';
import { useIncomingRoomInvites } from '@/lib/incoming-room-invites-context';
import { leaveActiveRoom } from '@/lib/leave-room';
import { LeaveRoomConfirm } from './leave-room-confirm';

/**
 * A full-screen prompt for a direct room invite. Rendered by
 * `IncomingNotifications`, which owns the decision of *whether* to show it —
 * it and the duel-challenge popup are both full-screen, so only one may be
 * on screen at a time. Before this existed a room invite only ever showed up
 * on the room screen's own "Входящие приглашения" card, so it was easy to
 * miss unless you happened to open Играть → Комната yourself. Accepting
 * while still sitting in a not-yet-started room of your own prompts leaving
 * it first — see `LeaveRoomConfirm`.
 */
export function InvitePopup({
  invite,
  onDismiss,
  queuedNote,
}: {
  invite: RoomInviteView;
  onDismiss: () => void;
  /** Rendered under "Позже" when something else is waiting behind this
   * popup, so dismissing it doesn't feel like the queue ended here. */
  queuedNote?: string;
}) {
  const router = useRouter();
  const { activeGame, setActiveGame } = useActiveGame();
  const { removeInvite } = useIncomingRoomInvites();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only relevant while sitting in a not-yet-started room of your own — an
  // `IN_PROGRESS` one already suppresses this whole modal (see the
  // top-level guard above), so it can never be true at this point.
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const doAccept = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiClient.post<{ sessionId: string }>(
        `/rooms/invites/${invite.inviteId}/accept`,
      );
      removeInvite(invite.inviteId);
      // Set before navigating, not after — `RoomPage`'s own `sessionId`
      // state reads `activeGame` in its lazy initializer on mount, so this
      // has to already be in place by the time it renders.
      setActiveGame({ type: 'room', sessionId: res.sessionId });
      router.push('/play/room');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось присоединиться к комнате');
      setBusy(false);
    }
  };

  const accept = () => {
    if (activeGame?.type === 'room' && activeGame.sessionId !== invite.sessionId) {
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
      // Worst case the old room lingers a little longer — still worth
      // proceeding with the invite the user actually asked to accept.
    }
    await doAccept();
  };

  const decline = async () => {
    setBusy(true);
    try {
      await apiClient.post(`/rooms/invites/${invite.inviteId}/decline`);
    } catch {
      // Removing it from the list either way — a stale decline is harmless.
    } finally {
      removeInvite(invite.inviteId);
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
          <p className="text-sm text-text-secondary">Приглашение в комнату</p>
          <p className="text-lg font-bold">{invite.roomName ?? 'Комната'}</p>
          <p className="text-xs text-text-muted">
            {invite.fromNickname ?? 'Друг'} зовёт вас · {invite.participantCount}/
            {invite.maxParticipants} · {invite.questionCount} вопросов
          </p>
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
                {busy ? 'Подключение…' : 'Присоединиться'}
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
