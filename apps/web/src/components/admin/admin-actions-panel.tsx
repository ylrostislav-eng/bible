'use client';

import { ADMIN_ACTION_LABELS, isGameMasterRole, type AdminActionView } from '@bible-arena/shared';
import { Card } from '@/components/ui/card';
import { RoleBadge } from '@/components/ui/role-badge';
import { useAuth } from '@/lib/auth-context';
import { PanelState, formatWhen, useAdminData } from './admin-panel-shell';

/**
 * Журнал гейм-мастера: кто, когда, над кем и что сделал.
 *
 * Читается сверху вниз как лента, без фильтров: смысл в том, чтобы через
 * месяц найти строку «монеты +500 — компенсация за сорванную дуэль», а
 * не в том, чтобы строить по нему отчёты.
 *
 * Гейм-мастеру приходит весь журнал, включая работу его администраторов;
 * администратору — только его собственные строки. Решает это сервер, а
 * подпись внизу объясняет человеку, что именно он видит, — иначе
 * администратор решил бы, что коллеги ничего не делают.
 */
export function AdminActionsPanel() {
  const { user } = useAuth();
  const master = isGameMasterRole(user?.role);
  const { data, error, loading } = useAdminData<AdminActionView[]>('/admin/actions');

  if (!data) return <PanelState loading={loading} error={error} />;

  return (
    <div className="flex flex-col gap-2">
      <PanelState
        loading={false}
        error={null}
        empty={data.length === 0}
        emptyText="Здесь появится всё, что вы сделаете"
      />

      {data.map((action) => (
        <Card key={action.id} className="flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">{ADMIN_ACTION_LABELS[action.kind]}</p>
            <p className="shrink-0 text-xs text-text-muted">{formatWhen(action.createdAt)}</p>
          </div>
          <p className="text-sm text-text-secondary">{action.summary}</p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
            {action.targetNickname ? `Игрок: ${action.targetNickname} · ` : ''}
            {action.adminNickname ?? 'без имени'}
            <RoleBadge role={action.actorRole} />
          </p>
        </Card>
      ))}

      {data.length > 0 && (
        <p className="pt-1 text-center text-xs text-text-muted">
          {master
            ? 'Видны все действия — ваши и ваших администраторов'
            : 'Видны только ваши действия; полный журнал у гейм-мастера'}
        </p>
      )}
    </div>
  );
}
