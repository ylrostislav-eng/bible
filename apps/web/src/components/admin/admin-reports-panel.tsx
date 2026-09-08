'use client';

import {
  ABUSE_REPORT_REASON_LABELS,
  DEFAULT_MUTE_HOURS,
  type AbuseReportView,
} from '@bible-arena/shared';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { ApiError, apiClient } from '@/lib/api';
import { PanelState, formatWhen, useAdminData } from './admin-panel-shell';

/**
 * Очередь жалоб.
 *
 * Порядок разбора подсказывает само приложение: у строки видно, сколько
 * человек пожаловались на этого же игрока. Один сердитый и десять разных
 * — разные вещи, и без этого числа они на экране одинаковы.
 */
export function AdminReportsPanel() {
  const { data, error, loading, reload, setError } =
    useAdminData<AbuseReportView[]>('/moderation/reports');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hours, setHours] = useState(DEFAULT_MUTE_HOURS);

  const act = async (id: string, action: 'uphold' | 'dismiss') => {
    setBusyId(id);
    try {
      await apiClient.patch(
        `/moderation/reports/${id}/${action}`,
        action === 'uphold' ? { muteHours: hours } : {},
      );
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось разобрать жалобу');
    } finally {
      setBusyId(null);
    }
  };

  if (!data) return <PanelState loading={loading} error={error} />;

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-danger">{error}</p>}

      <Card className="flex-col gap-2">
        <label className="text-xs text-text-secondary" htmlFor="mute-hours">
          Срок ограничения при подтверждении, часов
        </label>
        <input
          id="mute-hours"
          type="number"
          min={1}
          max={8760}
          value={hours}
          onChange={(e) => setHours(Math.max(1, Number(e.target.value) || 1))}
          className="h-10 w-28 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
        />
        <p className="text-xs text-text-muted">
          Пока ограничение действует, игрок не может звать других в игру и слать заявки.
        </p>
      </Card>

      <PanelState
        loading={false}
        error={null}
        empty={data.length === 0}
        emptyText="Жалоб на разбор нет"
      />

      {data.map((report) => (
        <Card key={report.id} className="flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{report.targetNickname ?? 'Игрок'}</p>
              <p className="text-xs text-text-muted">
                {ABUSE_REPORT_REASON_LABELS[report.reason]} · от{' '}
                {report.reporterNickname ?? 'игрока'} · {formatWhen(report.createdAt)}
              </p>
            </div>
            {report.pendingAgainstTarget > 1 && (
              <span className="shrink-0 rounded-full bg-danger/15 px-2 py-0.5 text-xs font-semibold text-danger">
                жалоб: {report.pendingAgainstTarget}
              </span>
            )}
          </div>

          {report.comment && (
            <p className="rounded-lg bg-surface-hover p-2 text-sm text-text-secondary">
              {report.comment}
            </p>
          )}

          {report.targetMutedUntil && (
            <p className="text-xs text-warning">
              Уже ограничен до {formatWhen(report.targetMutedUntil)}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => void act(report.id, 'uphold')}
              disabled={busyId === report.id}
              className="h-9 flex-1 rounded-lg bg-danger text-xs font-semibold text-bg disabled:opacity-50"
            >
              Подтвердить · {hours} ч
            </button>
            <button
              onClick={() => void act(report.id, 'dismiss')}
              disabled={busyId === report.id}
              className="h-9 flex-1 rounded-lg bg-surface-hover text-xs font-semibold text-text-secondary disabled:opacity-50"
            >
              Отклонить
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}
