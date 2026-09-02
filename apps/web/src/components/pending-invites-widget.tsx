'use client';

import type { PendingChallenge } from '@bible-arena/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TournamentIcon } from '@/components/icons/nav-icons';
import { useActiveGame } from '@/lib/active-game-context';
import { ApiError, apiClient } from '@/lib/api';
import { useIncomingChallenges } from '@/lib/incoming-challenges-context';
import { useIncomingRoomInvites } from '@/lib/incoming-room-invites-context';
import { leaveActiveRoom } from '@/lib/leave-room';
import { LeaveRoomConfirm } from './leave-room-confirm';

/**
 * A floating badge+panel for pending duel challenges *and* room invites —
 * the persistent home for either one once you tap "Позже" on
 * `IncomingNotifications`'s full-screen popup, so it doesn't just vanish.
 * Covers both kinds in a single widget rather than two competing floating
 * buttons: the popup already treats them as one family (only one shows at a
 * time, with the other queued behind it), so splitting them back apart here
 * would just be visual clutter — and a duel challenge dismissed with
 * "Позже" used to have nowhere to resurface *at all* short of navigating to
 * the duel screen's own list, unlike room invites. Mirrors `ChatWidget`'s
 * collapsed-icon/expanded-panel shape, positioned just to its left so the
 * two don't overlap. Only rendered while there's at least one of either —
 * unlike chat, an empty state here has nothing useful to show.
 */
export function PendingInvitesWidget() {
  const { challenges } = useIncomingChallenges();
  const { invites } = useIncomingRoomInvites();
  const [open, setOpen] = useState(false);

  const total = challenges.length + invites.length;
  if (total === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed right-20 bottom-24 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-surface text-text-primary shadow-lg ring-2 ring-primary"
        aria-label="Приглашения"
      >
        <TournamentIcon className="h-6 w-6" />
        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-on-primary">
          {total > 99 ? '99+' : total}
        </span>
      </button>

      {open && (
        <div className="fixed right-4 bottom-40 z-30 flex max-h-[60vh] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border p-3">
            <p className="text-sm font-bold">Приглашения</p>
            <button onClick={() => setOpen(false)} className="text-sm text-text-secondary">
              Свернуть
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <div className="flex flex-col gap-3">
              {challenges.map((challenge) => (
                <ChallengeRow key={challenge.sessionId} sessionId={challenge.sessionId} />
              ))}
              {invites.map((invite) => (
                <InviteRow key={invite.inviteId} inviteId={invite.inviteId} />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ChallengeRow({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const { activeGame, setActiveGame } = useActiveGame();
  const { challenges, removeChallenge } = useIncomingChallenges();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const challenge: PendingChallenge | undefined = challenges.find((c) => c.sessionId === sessionId);
  if (!challenge) return null;

  const doAccept = async () => {
    setBusy(true);
    setError(null);
    try {
      // Accepts at the sender's full question count — fine-tuning it down
      // is only offered on the full-screen popup, not worth reproducing a
      // whole slider for in this compact a row.
      const res = await apiClient.post<{ sessionId: string }>(`/game/duel/${sessionId}/respond`, {
        action: 'ACCEPT',
        questionCount: challenge.questionCount,
      });
      removeChallenge(sessionId);
      setActiveGame({ type: 'duel', sessionId: res.sessionId });
      router.push('/play/duel');
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
      // Worst case the old room lingers a little longer — still worth
      // proceeding with the challenge the user actually asked to accept.
    }
    await doAccept();
  };

  const decline = async () => {
    setBusy(true);
    try {
      await apiClient.post(`/game/duel/${sessionId}/respond`, { action: 'DECLINE' });
    } catch {
      // Removing it from the list either way — a stale decline is harmless.
    } finally {
      removeChallenge(sessionId);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{challenge.fromNickname ?? 'Игрок'}</p>
        <p className="text-xs text-text-muted">
          Вызов на дуэль · {challenge.questionCount} вопросов
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
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={accept}
              disabled={busy}
              className="h-9 flex-1 rounded-lg bg-primary text-xs font-semibold text-on-primary disabled:opacity-50"
            >
              {busy ? 'Подключение…' : 'Принять'}
            </button>
            <button
              onClick={() => void decline()}
              disabled={busy}
              className="h-9 flex-1 rounded-lg bg-surface-hover text-xs font-semibold text-text-secondary disabled:opacity-50"
            >
              Отклонить
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function InviteRow({ inviteId }: { inviteId: string }) {
  const router = useRouter();
  const { activeGame, setActiveGame } = useActiveGame();
  const { invites, removeInvite } = useIncomingRoomInvites();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const invite = invites.find((i) => i.inviteId === inviteId);
  if (!invite) return null;

  const doAccept = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiClient.post<{ sessionId: string }>(`/rooms/invites/${inviteId}/accept`);
      removeInvite(inviteId);
      setActiveGame({ type: 'room', sessionId: res.sessionId });
      router.push('/play/room');
    } catch (err) {
      // Deliberately not removed on failure — a full room can free up a
      // slot before the game starts, so the invite (and this row) stays
      // put for a retry rather than being treated as a dead end.
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
      await apiClient.post(`/rooms/invites/${inviteId}/decline`);
    } catch {
      // Removing it from the list either way — a stale decline is harmless.
    } finally {
      removeInvite(inviteId);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{invite.roomName ?? 'Комната'}</p>
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
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={accept}
              disabled={busy}
              className="h-9 flex-1 rounded-lg bg-primary text-xs font-semibold text-on-primary disabled:opacity-50"
            >
              {busy ? 'Подключение…' : 'Присоединиться'}
            </button>
            <button
              onClick={() => void decline()}
              disabled={busy}
              className="h-9 flex-1 rounded-lg bg-surface-hover text-xs font-semibold text-text-secondary disabled:opacity-50"
            >
              Отклонить
            </button>
          </div>
        </>
      )}
    </div>
  );
}
