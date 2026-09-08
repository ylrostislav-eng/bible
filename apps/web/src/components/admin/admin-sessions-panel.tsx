'use client';

import { ADMIN_GAME_MODE_LABELS, type AdminSessionRow } from '@bible-arena/shared';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { ApiError, apiClient } from '@/lib/api';
import { PanelState, formatWhen, useAdminData } from './admin-panel-shell';

/**
 * Идущие партии — и возможность закрыть зависшую.
 *
 * Уборка брошенных партий работает сама и закрывает почти всё, но
 * «почти» здесь и есть смысл этой вкладки: комната, в которой лидер
 * молчит, а участники ждут, живёт до срока уборки, и человеку об этом
 * скажут раньше, чем сработает таймер.
 */
export function AdminSessionsPanel() {
  const { data, error, loading, reload, setError } =
    useAdminData<AdminSessionRow[]>('/admin/sessions');
  const [busyId, setBusyId] = useState<string | null>(null);

  const close = async (sessionId: string) => {
    setBusyId(sessionId);
    try {
      await apiClient.post(`/admin/sessions/${sessionId}/close`);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось закрыть партию');
    } finally {
      setBusyId(null);
    }
  };

  if (!data) return <PanelState loading={loading} error={error} />;

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-danger">{error}</p>}
      <PanelState
        loading={false}
        error={null}
        empty={data.length === 0}
        emptyText="Сейчас никто не играет"
      />

      {data.map((session) => (
        <Card key={session.sessionId} className="flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {ADMIN_GAME_MODE_LABELS[session.mode]}
                {session.roomName ? ` · ${session.roomName}` : ''}
              </p>
              <p className="truncate text-xs text-text-muted">
                {session.status} · {formatWhen(session.createdAt)}
              </p>
              <p className="truncate text-xs text-text-secondary">
                {session.players.join(', ') || 'без игроков'}
              </p>
            </div>
            <button
              onClick={() => void close(session.sessionId)}
              disabled={busyId === session.sessionId}
              className="h-9 shrink-0 rounded-lg bg-surface-hover px-3 text-xs font-semibold disabled:opacity-50"
            >
              Закрыть
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}
