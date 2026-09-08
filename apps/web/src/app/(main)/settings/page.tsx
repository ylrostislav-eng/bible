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
import { AgeSafetySection } from '@/components/settings/age-safety-section';
import { ReadingComfortSection } from '@/components/settings/reading-comfort-section';
import { RemindersSection } from '@/components/settings/reminders-section';
import { SoundSection } from '@/components/settings/sound-section';
import { ScreenBack } from '@/components/ui/screen-back';
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
      <header className="flex items-center gap-3">
        <h1 className="text-xl font-bold">Настройки</h1>
      </header>

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

      <ReadingComfortSection />

      <SoundSection />

      <AgeSafetySection />

      <RemindersSection />

      <TelegramIdRow />

      <ScreenBack href="/profile" label="Назад в профиль" />
    </div>
  );
}

/**
 * Свой Telegram ID — внизу настроек, мелко, без объяснений про роли.
 *
 * Он нужен ровно для одного: вписать его в `GAME_MASTER_TELEGRAM_ID` или
 * `ADMIN_TELEGRAM_IDS` в панели развёртывания. Узнать свой номер иначе
 * человеку негде — в Telegram он не показан, а спрашивать его у нас же
 * через поддержку абсурдно. Обычному игроку строка не мешает: она
 * приглушена и ничего не обещает.
 *
 * Копирование — не украшение: номер длинный, и переписывать его руками с
 * телефона в панель на компьютере значит однажды ошибиться цифрой и
 * долго искать, почему права не выдались.
 */
function TelegramIdRow() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  if (!user) return null;

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(user.telegramId)
          .then(() => setCopied(true))
          .catch(() => setCopied(false));
      }}
      className="mx-auto text-xs text-text-muted transition active:text-text-secondary"
    >
      Ваш Telegram ID: {user.telegramId}
      {copied ? ' · скопировано' : ''}
    </button>
  );
}
