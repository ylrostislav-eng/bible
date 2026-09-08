'use client';

import { ADMIN_GAME_MODE_LABELS, type AdminOverview } from '@bible-arena/shared';
import { Card } from '@/components/ui/card';
import { PanelState, formatWhen, useAdminData } from './admin-panel-shell';

/**
 * Сводка — первое, что видит администратор, и потому здесь только те
 * числа, по которым принимают решения: сколько людей, сколько играют,
 * что ждёт разбора. Всё остальное живёт в своих вкладках.
 */
export function AdminOverviewPanel() {
  const { data, error, loading } = useAdminData<AdminOverview>('/admin/overview');

  if (!data) return <PanelState loading={loading} error={error} />;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Игроков всего" value={data.players.total} />
        <Stat label="В сети сейчас" value={data.players.online} accent />
        <Stat label="Новых за неделю" value={data.players.newLastWeek} />
        <Stat label="Детских аккаунтов" value={data.players.children} />
      </div>

      <Card className="flex-col gap-2">
        <p className="text-sm font-semibold text-text-secondary">Партии за сутки</p>
        {Object.entries(data.games.lastDay).map(([mode, count]) => (
          <div key={mode} className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">
              {ADMIN_GAME_MODE_LABELS[mode as keyof typeof ADMIN_GAME_MODE_LABELS]}
            </span>
            <span className="font-semibold tabular-nums">{count}</span>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-sm">
          <span className="text-text-secondary">Идёт прямо сейчас</span>
          <span className="font-semibold tabular-nums text-primary">{data.games.active}</span>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Жалоб на разбор"
          value={data.moderation.pendingReports}
          accent={data.moderation.pendingReports > 0}
        />
        <Stat label="Под ограничением" value={data.moderation.mutedNow} />
        <Stat
          label="Ошибок не разобрано"
          value={data.errors.unresolved}
          accent={data.errors.unresolved > 0}
        />
        <Stat label="Ошибок за сутки" value={data.errors.lastDay} />
      </div>

      <p className="text-center text-xs text-text-muted">Собрано {formatWhen(data.generatedAt)}</p>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <Card className="flex-col">
      <p className="text-xs text-text-secondary">{label}</p>
      <p
        className={
          accent ? 'text-lg font-bold tabular-nums text-primary' : 'text-lg font-bold tabular-nums'
        }
      >
        {value}
      </p>
    </Card>
  );
}
