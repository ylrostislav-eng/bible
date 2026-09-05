'use client';

import { SOUND_VOLUME_DEFAULT, SOUND_VOLUME_MAX, SOUND_VOLUME_MIN } from '@bible-arena/shared';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useSound } from '@/lib/sound';

/**
 * Звук и вибро.
 *
 * Здесь только то, что уже звучит. Поле для фоновой музыки в профиле есть,
 * но переключателя нет: тумблер, который ничего не выключает, читается как
 * поломка — он появится вместе с самой музыкой.
 *
 * Громкость сохраняется не на каждое движение ползунка, а когда он замер:
 * иначе один проход от края до края — это сотня запросов к серверу.
 */
export function SoundSection() {
  const { user, updateProfile } = useAuth();
  const { play } = useSound();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(user?.soundVolume ?? SOUND_VOLUME_DEFAULT);
  const dragging = useRef(false);

  // Профиль может приехать позже загрузки экрана или измениться мимо
  // ползунка — но не перебивая то, что игрок как раз выставляет руками.
  useEffect(() => {
    if (user && !dragging.current) setVolume(user.soundVolume);
  }, [user]);

  // Сохраняем, когда ползунок замер, а не на каждое его движение.
  //
  // Сначала сохраняли по отпусканию — и на стрелках клавиатуры это
  // ломалось: первое же нажатие запускало запрос, ползунок на время
  // запроса гас, фокус терялся, и остальные нажатия уходили в никуда
  // (из 70 к 50 приходили 65). Пауза после последнего изменения решает
  // оба случая — и мышь, и клавиатуру.
  useEffect(() => {
    if (!user || volume === user.soundVolume) {
      dragging.current = false;
      return;
    }
    dragging.current = true;
    const timer = setTimeout(() => {
      updateProfile({ soundVolume: volume })
        .then(() => play('tap'))
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Не удалось сохранить'))
        .finally(() => {
          dragging.current = false;
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [volume, user, updateProfile, play]);

  if (!user) return null;

  async function save(patch: { soundEnabled?: boolean; hapticsEnabled?: boolean }) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile(patch);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4">
      <div>
        <h2 className="font-semibold">Звук</h2>
        <p className="mt-0.5 text-sm text-text-secondary">
          Короткие отклики на нажатие, верный ответ, победу и поражение. Всё, что говорится звуком,
          видно и на экране — играть без звука можно так же.
        </p>
      </div>

      <Switch
        label="Звуки"
        hint="Нажатия, ответы, конец партии."
        checked={user.soundEnabled}
        disabled={saving}
        onToggle={() => void save({ soundEnabled: !user.soundEnabled })}
      />

      <Switch
        label="Вибро"
        hint="Короткий отклик на телефоне. На компьютере ничего не меняет."
        checked={user.hapticsEnabled}
        disabled={saving}
        onToggle={() => void save({ hapticsEnabled: !user.hapticsEnabled })}
      />

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <div className="flex items-baseline justify-between">
          <label htmlFor="sound-volume" className="text-sm font-medium text-text-secondary">
            Громкость
          </label>
          <span className="text-sm tabular-nums text-text-secondary">{volume}%</span>
        </div>
        <input
          id="sound-volume"
          type="range"
          min={SOUND_VOLUME_MIN}
          max={SOUND_VOLUME_MAX}
          step={5}
          value={volume}
          disabled={!user.soundEnabled}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="accent-primary disabled:opacity-50"
        />
        <button
          type="button"
          disabled={!user.soundEnabled}
          onClick={() => play('reward')}
          className="self-start rounded-xl border border-border bg-surface-hover px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
        >
          Проверить звук
        </button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}

function Switch({
  label,
  hint,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        <p className="mt-0.5 text-sm text-text-secondary">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={onToggle}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
          checked ? 'bg-primary' : 'bg-surface-hover border border-border'
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left] ${
            checked ? 'left-6' : 'left-1'
          }`}
        />
      </button>
    </div>
  );
}
