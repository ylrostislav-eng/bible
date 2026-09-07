'use client';

import { useState } from 'react';
import { ApiError, apiClient } from '@/lib/api';
import { PlayerList } from './player-list';

interface RoomInvitePickerProps {
  sessionId: string;
  /** Already-in-the-room ids — hidden from the list, inviting them again is
   * meaningless. */
  excludeUserIds: string[];
}

/**
 * Кого позвать в комнату из лобби — тот же список игроков, что и во
 * вкладке «Игроки», только кнопка приглашает в эту комнату.
 *
 * Раньше здесь был свой список и свой поиск, показывавшие только друзей:
 * приглашать можно было лишь их. Дружба перестала быть условием, и держать
 * рядом второй список с другими правилами стало не только лишней работой,
 * но и способом разойтись — в одном месте человек виден, в другом нет.
 */
export function RoomInvitePicker({ sessionId, excludeUserIds }: RoomInvitePickerProps) {
  const [inviteError, setInviteError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {inviteError && <p className="text-sm text-danger">{inviteError}</p>}
      <PlayerList
        mode="invite"
        excludeUserIds={excludeUserIds}
        onInvite={async (userId) => {
          setInviteError(null);
          try {
            await apiClient.post(`/rooms/${sessionId}/invite`, { userId });
          } catch (err) {
            setInviteError(
              err instanceof ApiError ? err.message : 'Не удалось отправить приглашение',
            );
            throw err;
          }
        }}
      />
    </div>
  );
}
