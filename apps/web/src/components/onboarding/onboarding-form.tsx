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
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';
import { Button } from '../ui/button';

export function OnboardingForm() {
  const { user, updateProfile } = useAuth();
  const [nickname, setNickname] = useState('');
  const [country, setCountry] = useState('');
  const [language, setLanguage] = useState<LanguageCode>(user?.language ?? 'ru');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nicknameValid =
    nickname.length >= NICKNAME_MIN_LENGTH &&
    nickname.length <= NICKNAME_MAX_LENGTH &&
    NICKNAME_PATTERN.test(nickname);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!nicknameValid || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      await updateProfile({
        nickname,
        country: country || null,
        language,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Что-то пошло не так, попробуйте ещё раз');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pt-safe flex min-h-screen flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-2xl font-bold">Добро пожаловать!</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Настройте профиль, чтобы начать изучать Библию и соревноваться с друзьями.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-secondary">Никнейм</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="faithful_1"
              maxLength={NICKNAME_MAX_LENGTH}
              className="h-12 rounded-xl border border-border bg-surface px-4 text-text-primary outline-none focus:border-primary"
              autoFocus
            />
            {nickname.length > 0 && !nicknameValid && (
              <span className="text-xs text-danger">
                {NICKNAME_MIN_LENGTH}–{NICKNAME_MAX_LENGTH} символов: буквы, цифры, «_»
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-secondary">Страна</span>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="h-12 rounded-xl border border-border bg-surface px-4 text-text-primary outline-none focus:border-primary"
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
            <span className="text-sm font-medium text-text-secondary">Язык</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as LanguageCode)}
              className="h-12 rounded-xl border border-border bg-surface px-4 text-text-primary outline-none focus:border-primary"
            >
              {SUPPORTED_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_NAMES[code]}
                </option>
              ))}
            </select>
          </label>

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button type="submit" disabled={!nicknameValid || submitting}>
            {submitting ? 'Сохранение…' : 'Продолжить'}
          </Button>
        </form>
      </div>
    </div>
  );
}
