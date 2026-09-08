'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { ApiError, apiClient } from '@/lib/api';
import { PanelState, formatWhen, useAdminData } from './admin-panel-shell';

/** Что отдаёт `/telemetry/reports/summary` — одна строка на повторяющуюся
 * поломку, а не на каждое её появление. */
interface ErrorGroup {
  source: 'WEB' | 'API';
  kind: string;
  message: string;
  count: number;
  lastSeenAt: string | null;
}

/**
 * Ошибки — сгруппированные, а не потоком.
 *
 * Одна поломка на живом приложении даёт сотни записей, и список по одной
 * из них показывает не «что сломано», а «как часто это происходит».
 * Отмечать разобранным тоже приходится группой — иначе после починки
 * пришлось бы закрывать сотни строк руками.
 */
export function AdminErrorsPanel() {
  const { data, error, loading, reload, setError } = useAdminData<ErrorGroup[]>(
    '/telemetry/reports/summary',
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const resolve = async (group: ErrorGroup) => {
    const key = `${group.source}:${group.kind}:${group.message}`;
    setBusyKey(key);
    try {
      await apiClient.patch('/telemetry/reports/resolve-group', {
        source: group.source,
        kind: group.kind,
        message: group.message,
      });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось отметить разобранным');
    } finally {
      setBusyKey(null);
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
        emptyText="Неразобранных ошибок нет"
      />

      {data.map((group) => {
        const key = `${group.source}:${group.kind}:${group.message}`;
        return (
          <Card key={key} className="flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{group.kind}</p>
                <p className="text-xs text-text-muted">
                  {group.source} · {group.count} раз
                  {group.lastSeenAt ? ` · последний ${formatWhen(group.lastSeenAt)}` : ''}
                </p>
              </div>
              <button
                onClick={() => void resolve(group)}
                disabled={busyKey === key}
                className="h-9 shrink-0 rounded-lg bg-surface-hover px-3 text-xs font-semibold disabled:opacity-50"
              >
                Разобрано
              </button>
            </div>
            {/* Текст ошибки — то единственное, ради чего сюда заходят;
                режем по высоте, а не по количеству букв: обрезанное на
                середине слова сообщение перестаёт искаться поиском. */}
            <p className="max-h-24 overflow-y-auto rounded-lg bg-surface-hover p-2 font-mono text-xs break-words text-text-secondary">
              {group.message}
            </p>
          </Card>
        );
      })}
    </div>
  );
}
