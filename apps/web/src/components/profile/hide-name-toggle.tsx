'use client';

import { APP_ROLE_LABELS, isStaffRole } from '@bible-arena/shared';
import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

/**
 * «Скрыть имя» — прямо у имени, а не в настройках.
 *
 * Настройка меняет то, что видно вот здесь же, и правится по взгляду на
 * результат: нажал — имя стало значком, нажал ещё — вернулось. Уехав в
 * общий список настроек, она превратилась бы в тумблер, о котором надо
 * помнить, и проверять его пришлось бы, уходя на другой экран.
 *
 * Видна только гейм-мастеру и администраторам. Игроку она недоступна и на
 * сервере: безымянная строка в списках — это не приватность, а способ
 * пропасть из виду у того, кто на тебя пожаловался.
 *
 * Скрытие настоящее: имя перестаёт покидать сервер вовсе. Поэтому под
 * кнопкой написано, что именно увидят остальные, — иначе проверить это
 * можно только со второго аккаунта.
 */
export function HideNameToggle() {
  const { user, updateProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || !isStaffRole(user.role)) return null;

  const hidden = user.hideName;
  const label = APP_ROLE_LABELS[user.role];

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          updateProfile({ hideName: !hidden })
            .catch((err: unknown) =>
              setError(err instanceof ApiError ? err.message : 'Не удалось сохранить'),
            )
            .finally(() => setBusy(false));
        }}
        className="flex h-8 items-center gap-1.5 self-start rounded-full bg-surface-hover px-3 text-xs font-medium text-text-secondary transition active:text-text-primary disabled:opacity-50"
      >
        <EyeIcon crossed={!hidden} />
        {hidden ? 'Показать имя' : 'Скрыть имя'}
      </button>

      <p className="text-xs text-text-muted">
        {hidden
          ? `Вместо имени везде виден значок «${label}» — в рейтинге, списках, лобби и на табло.`
          : `Имя можно спрятать: везде останется значок «${label}».`}
      </p>

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path
        d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="2" />
      {crossed && (
        <path d="m4 4 16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  );
}
