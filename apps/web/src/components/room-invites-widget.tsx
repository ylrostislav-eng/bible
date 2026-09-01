'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useActiveGame } from '@/lib/active-game-context';
import { ApiError, apiClient } from '@/lib/api';
import { useIncomingRoomInvites } from '@/lib/incoming-room-invites-context';

/**
 * A floating badge+panel for pending room invites — the persistent home for
 * an invite once you tap "Позже" on `IncomingRoomInviteModal`'s full-screen
 * popup, so it doesn't just vanish. Mirrors `ChatWidget`'s
 * collapsed-icon/expanded-panel shape, positioned just to its left so the
 * two don't overlap. Only rendered at all while there's at least one
 * invite — unlike chat, an empty state here has nothing useful to show.
 */
export function RoomInvitesWidget() {
  const { invites } = useIncomingRoomInvites();
  const [open, setOpen] = useState(false);

  if (invites.length === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed right-20 bottom-24 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-surface text-text-primary shadow-lg ring-2 ring-primary"
        aria-label="Приглашения в комнаты"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
          <path d="M4 6h16v12H4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-on-primary">
          {invites.length > 99 ? '99+' : invites.length}
        </span>
      </button>

      {open && (
        <div className="fixed right-4 bottom-40 z-30 flex max-h-[60vh] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border p-3">
            <p className="text-sm font-bold">Приглашения в комнаты</p>
            <button onClick={() => setOpen(false)} className="text-sm text-text-secondary">
              Свернуть
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <div className="flex flex-col gap-3">
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

function InviteRow({ inviteId }: { inviteId: string }) {
  const router = useRouter();
  const { setActiveGame } = useActiveGame();
  const { invites, removeInvite } = useIncomingRoomInvites();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invite = invites.find((i) => i.inviteId === inviteId);
  if (!invite) return null;

  const accept = async () => {
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
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => void accept()}
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
    </div>
  );
}
