'use client';

import { useState } from 'react';
import { AdminActionsPanel } from '@/components/admin/admin-actions-panel';
import { AdminBroadcastPanel } from '@/components/admin/admin-broadcast-panel';
import { AdminErrorsPanel } from '@/components/admin/admin-errors-panel';
import { AdminOverviewPanel } from '@/components/admin/admin-overview-panel';
import { AdminPlayersPanel } from '@/components/admin/admin-players-panel';
import { AdminReportsPanel } from '@/components/admin/admin-reports-panel';
import { AdminSessionsPanel } from '@/components/admin/admin-sessions-panel';
import { RoleBadge } from '@/components/ui/role-badge';
import { ScreenBack } from '@/components/ui/screen-back';
import { isGameMasterRole, isStaffRole } from '@bible-arena/shared';
import { useAuth } from '@/lib/auth-context';
import clsx from 'clsx';

/** `masterOnly` — вкладки с необратимым: их не видно администраторам, и
 * сервер откажет им, даже если адрес набрать руками. */
const TABS = [
  { id: 'overview', label: 'Сводка', masterOnly: false },
  { id: 'reports', label: 'Жалобы', masterOnly: false },
  { id: 'players', label: 'Игроки', masterOnly: false },
  { id: 'sessions', label: 'Партии', masterOnly: false },
  { id: 'errors', label: 'Ошибки', masterOnly: false },
  { id: 'broadcast', label: 'Рассылка', masterOnly: true },
  { id: 'actions', label: 'Журнал', masterOnly: false },
] as const;

type TabId = (typeof TABS)[number]['id'];

/**
 * Экран администратора.
 *
 * Один маршрут с вкладками, а не семь маршрутов: разделы небольшие, и
 * разбирающий жалобу почти всегда идёт оттуда в карточку игрока и
 * обратно. С отдельными адресами эта дорога стала бы хождением по
 * истории браузера.
 *
 * Спрятанность экрана — удобство, а не защита: настоящая проверка стоит
 * на каждом запросе (`AdminGuard`), и обычный игрок, набравший `/admin`
 * руками, увидит здесь отказ, а не данные.
 */
export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabId>('overview');

  if (!user) return null;

  if (!isStaffRole(user.role)) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6">
        <ScreenBack href="/profile" />
        <p className="text-sm text-text-secondary">
          Этот раздел — для гейм-мастера и администраторов.
        </p>
      </div>
    );
  }

  const master = isGameMasterRole(user.role);
  const tabs = TABS.filter((item) => master || !item.masterOnly);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6">
      {/* Значок над заголовком, а не рядом: рядом он отнимал у подписи
          половину ширины, и она переносилась на две строки. */}
      <div className="flex flex-col gap-1.5">
        <RoleBadge role={user.role} size="md" className="self-start" />
        <div>
          <h1 className="text-xl font-bold">Управление</h1>
          <p className="text-sm text-text-secondary">
            {master
              ? 'Всё, что можно сделать с приложением'
              : 'Разбор жалоб, игроки, партии и ошибки'}
          </p>
        </div>
      </div>

      {/* Вкладки прокручиваются вбок: их семь, и втискивать их в ширину
          телефона переносом означало бы две строки шапки на всех экранах. */}
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-2">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={clsx(
                'h-9 shrink-0 rounded-full px-3.5 text-xs font-semibold transition',
                tab === id ? 'bg-primary text-on-primary' : 'bg-surface-hover text-text-secondary',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && <AdminOverviewPanel />}
      {tab === 'reports' && <AdminReportsPanel />}
      {tab === 'players' && <AdminPlayersPanel />}
      {tab === 'sessions' && <AdminSessionsPanel />}
      {tab === 'errors' && <AdminErrorsPanel />}
      {tab === 'broadcast' && master && <AdminBroadcastPanel />}
      {tab === 'actions' && <AdminActionsPanel />}

      <ScreenBack href="/profile" />
    </div>
  );
}
