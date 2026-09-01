'use client';

/**
 * Shown in place of the normal accept/decline row when accepting a duel
 * challenge or room invite would require leaving a room the user is
 * currently sitting in (not yet started, so it's a safe thing to ask about
 * rather than silently doing) — used by both `IncomingChallengeModal` and
 * `IncomingRoomInviteModal`.
 */
export function LeaveRoomConfirm({
  onConfirm,
  onCancel,
  busy,
  error,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-secondary">
        Сейчас вы находитесь в другой комнате. Чтобы принять это приглашение, нужно сначала покинуть
        текущую — если вы там единственный участник, она закроется, а если нет, лидером станет
        следующий игрок. Покинуть и присоединиться?
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={busy}
          className="h-11 flex-1 rounded-lg bg-primary text-sm font-semibold text-on-primary disabled:opacity-50"
        >
          {busy ? 'Секунду…' : 'Покинуть и присоединиться'}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="h-11 flex-1 rounded-lg bg-surface-hover text-sm font-semibold text-text-secondary disabled:opacity-50"
        >
          Остаться
        </button>
      </div>
    </div>
  );
}
