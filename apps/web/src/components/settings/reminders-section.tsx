'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

/**
 * The one switch for evening Telegram reminders.
 *
 * On by default and off in one tap, with the actual behaviour spelled out
 * underneath — "напоминания" alone could mean anything, and a person
 * deciding whether to let an app message them deserves to know exactly
 * when it would and what about.
 */
export function RemindersSection() {
  const { user, updateProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  const enabled = user.remindersEnabled;

  async function toggle() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile({ remindersEnabled: !enabled });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">Напоминания в Telegram</h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            Одно сообщение вечером, и только если серия дней вот-вот прервётся. Если вы уже сыграли
            сегодня — не напишем.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Напоминания в Telegram"
          disabled={saving}
          onClick={() => void toggle()}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            enabled ? 'bg-primary' : 'bg-surface-hover border border-border'
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left] ${
              enabled ? 'left-6' : 'left-1'
            }`}
          />
        </button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}
