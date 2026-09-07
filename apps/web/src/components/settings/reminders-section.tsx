'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

/**
 * Что приложению позволено писать в Telegram.
 *
 * Два переключателя, а не один, и это не мелочь: напоминание про серию —
 * инициатива приложения, а «вас зовут в игру» — просьба живого человека.
 * Один тумблер заставлял бы выбирать между «меня не дёргают» и «до меня
 * можно дозвониться», хотя это разные желания.
 *
 * Оба по умолчанию включены и выключаются одним тапом, и под каждым
 * написано, что именно придёт: слово «уведомления» само по себе не значит
 * ничего, а человек, решающий, пускать ли приложение себе в переписку,
 * должен знать, когда и о чём оно напишет.
 */
export function RemindersSection() {
  const { user, updateProfile } = useAuth();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  async function toggle(key: 'remindersEnabled' | 'inviteNotificationsEnabled', next: boolean) {
    if (savingKey) return;
    setSavingKey(key);
    setError(null);
    try {
      await updateProfile({ [key]: next });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <section className="glass-card flex flex-col gap-4 rounded-2xl p-4">
      <Row
        title="Напоминания в Telegram"
        description="Одно сообщение вечером, и только если серия дней вот-вот прервётся. Если вы уже сыграли сегодня — не напишем."
        enabled={user.remindersEnabled}
        saving={savingKey === 'remindersEnabled'}
        onToggle={() => void toggle('remindersEnabled', !user.remindersEnabled)}
      />

      <div className="border-t border-border" />

      <Row
        title="Когда вас зовут в игру"
        description="Сообщение, если вас вызвали на дуэль или позвали в комнату, пока приложение закрыто. Когда приложение открыто, приглашение и так видно, и мы промолчим. Ночью не пишем."
        enabled={user.inviteNotificationsEnabled}
        saving={savingKey === 'inviteNotificationsEnabled'}
        onToggle={() => void toggle('inviteNotificationsEnabled', !user.inviteNotificationsEnabled)}
      />

      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}

function Row({
  title,
  description,
  enabled,
  saving,
  onToggle,
}: {
  title: string;
  description: string;
  enabled: boolean;
  saving: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-0.5 text-sm text-text-secondary">{description}</p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={title}
        disabled={saving}
        onClick={onToggle}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
          enabled ? 'bg-primary' : 'border border-border bg-surface-hover'
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left] ${
            enabled ? 'left-6' : 'left-1'
          }`}
        />
      </button>
    </div>
  );
}
