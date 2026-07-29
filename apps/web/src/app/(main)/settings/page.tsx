'use client';

import {
  COUNTRIES,
  LANGUAGE_NAMES,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  NICKNAME_PATTERN,
  SUPPORTED_LANGUAGES,
  type LanguageCode,
} from '@bible-arena/shared';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';

export default function SettingsPage() {
  const { user, updateProfile } = useAuth();
  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? '');
  const [country, setCountry] = useState(user?.country ?? '');
  const [language, setLanguage] = useState<LanguageCode>(user?.language ?? 'ru');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!user) return null;

  const nicknameValid =
    nickname.length >= NICKNAME_MIN_LENGTH &&
    nickname.length <= NICKNAME_MAX_LENGTH &&
    NICKNAME_PATTERN.test(nickname);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!nicknameValid || submitting) return;

    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      await updateProfile({
        nickname,
        avatarUrl: avatarUrl.trim() || null,
        country: country || null,
        language,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить изменения');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-6">
      <h1 className="text-xl font-bold">Настройки</h1>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary">Никнейм</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={NICKNAME_MAX_LENGTH}
            className="h-11 rounded-lg border border-border bg-surface-hover px-3 outline-none focus:border-primary"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary">Ссылка на аватар</span>
          <input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
            className="h-11 rounded-lg border border-border bg-surface-hover px-3 outline-none focus:border-primary"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary">Страна</span>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="h-11 rounded-lg border border-border bg-surface-hover px-3 outline-none focus:border-primary"
          >
            <option value="">Не указана</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.nameRu}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary">Язык интерфейса</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as LanguageCode)}
            className="h-11 rounded-lg border border-border bg-surface-hover px-3 outline-none focus:border-primary"
          >
            {SUPPORTED_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {LANGUAGE_NAMES[code]}
              </option>
            ))}
          </select>
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}
        {saved && !error && <p className="text-sm text-success">Изменения сохранены</p>}

        <Button type="submit" disabled={!nicknameValid || submitting}>
          {submitting ? 'Сохранение…' : 'Сохранить'}
        </Button>
      </form>
    </div>
  );
}
