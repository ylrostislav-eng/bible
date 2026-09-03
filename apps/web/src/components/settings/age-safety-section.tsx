'use client';

import {
  AGE_BANDS,
  AGE_BAND_DESCRIPTIONS,
  AGE_BAND_LABELS,
  GUARDIAN_PIN_LENGTH,
  GUARDIAN_PIN_PATTERN,
  type AgeBand,
} from '@bible-arena/shared';
import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '../ui/button';

const pinInputClass =
  'h-11 rounded-lg border border-border bg-surface-hover px-3 text-center tracking-[0.5em] outline-none focus:border-primary';

/**
 * The one place the age mode and the guardian PIN can be changed after
 * onboarding.
 *
 * Deliberately its own card rather than another field in the profile form:
 * saving a nickname and turning off the child mode are different kinds of
 * action, and the second one asks for a PIN.
 */
export function AgeSafetySection() {
  const { user, updateProfile, updateGuardianPin } = useAuth();
  const [editingBand, setEditingBand] = useState(false);
  const [band, setBand] = useState<AgeBand | null>(null);
  const [bandPin, setBandPin] = useState('');
  const [bandError, setBandError] = useState<string | null>(null);
  const [bandSaving, setBandSaving] = useState(false);

  const [pinPanel, setPinPanel] = useState<'closed' | 'set' | 'clear'>('closed');
  const [newPin, setNewPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSaving, setPinSaving] = useState(false);
  const [pinNotice, setPinNotice] = useState<string | null>(null);

  if (!user) return null;

  const childMode = user.childMode;
  // The PIN is only ever asked for when it actually guards something: it
  // guards leaving the child mode, so entering it doesn't need one.
  const pinRequired = childMode && user.guardianPinSet && band !== 'CHILD';

  async function saveBand() {
    if (!band || bandSaving) return;
    setBandSaving(true);
    setBandError(null);
    try {
      await updateProfile({
        ageBand: band,
        guardianConfirmed: band === 'CHILD',
        ...(pinRequired ? { guardianPin: bandPin } : {}),
      });
      setEditingBand(false);
      setBandPin('');
    } catch (err) {
      setBandError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
    } finally {
      setBandSaving(false);
    }
  }

  async function savePin(clear: boolean) {
    if (pinSaving) return;
    setPinSaving(true);
    setPinError(null);
    setPinNotice(null);
    try {
      await updateGuardianPin({
        pin: clear ? null : newPin,
        ...(user?.guardianPinSet ? { currentPin } : {}),
      });
      setPinPanel('closed');
      setNewPin('');
      setCurrentPin('');
      setPinNotice(clear ? 'PIN-код удалён' : 'PIN-код сохранён');
    } catch (err) {
      setPinError(err instanceof ApiError ? err.message : 'Не удалось сохранить PIN-код');
    } finally {
      setPinSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4">
      <div>
        <h2 className="font-semibold">Возраст и безопасность</h2>
        <p className="mt-0.5 text-sm text-text-secondary">
          {user.ageBand ? AGE_BAND_LABELS[user.ageBand] : 'Возраст не указан'}
          {' — '}
          {user.ageBand ? AGE_BAND_DESCRIPTIONS[user.ageBand] : 'выберите вариант'}
        </p>
      </div>

      {!editingBand ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setBand(user?.ageBand ?? null);
            setBandError(null);
            setEditingBand(true);
          }}
        >
          Изменить возрастной режим
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          {AGE_BANDS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setBand(option)}
              aria-pressed={band === option}
              className={`rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                band === option ? 'border-primary bg-primary/10' : 'border-border bg-surface-hover'
              }`}
            >
              <span className="font-medium">{AGE_BAND_LABELS[option]}</span>
            </button>
          ))}

          {pinRequired && (
            <label className="mt-1 flex flex-col gap-1.5">
              <span className="text-sm text-text-secondary">Родительский PIN-код</span>
              <input
                value={bandPin}
                onChange={(e) =>
                  setBandPin(e.target.value.replace(/\D/g, '').slice(0, GUARDIAN_PIN_LENGTH))
                }
                inputMode="numeric"
                autoComplete="off"
                placeholder="••••"
                className={pinInputClass}
              />
            </label>
          )}

          {bandError && <p className="text-sm text-danger">{bandError}</p>}

          <div className="mt-1 flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setEditingBand(false);
                setBandError(null);
                setBandPin('');
              }}
            >
              Отмена
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={
                !band ||
                band === user.ageBand ||
                bandSaving ||
                (pinRequired && !GUARDIAN_PIN_PATTERN.test(bandPin))
              }
              onClick={() => void saveBand()}
            >
              {bandSaving ? 'Сохранение…' : 'Сохранить'}
            </Button>
          </div>
        </div>
      )}

      <div className="border-t border-border pt-4">
        <p className="text-sm font-medium">
          Родительский PIN-код {user.guardianPinSet ? '— установлен' : '— не установлен'}
        </p>
        <p className="mt-0.5 text-xs text-text-secondary">
          Пока PIN-код установлен, детский режим нельзя отключить без него.
        </p>

        {pinNotice && <p className="mt-2 text-sm text-success">{pinNotice}</p>}

        {pinPanel === 'closed' ? (
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setPinPanel('set');
                setPinError(null);
                setPinNotice(null);
              }}
            >
              {user.guardianPinSet ? 'Изменить PIN' : 'Установить PIN'}
            </Button>
            {user.guardianPinSet && (
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setPinPanel('clear');
                  setPinError(null);
                  setPinNotice(null);
                }}
              >
                Удалить PIN
              </Button>
            )}
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {user.guardianPinSet && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-text-secondary">Текущий PIN-код</span>
                <input
                  value={currentPin}
                  onChange={(e) =>
                    setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, GUARDIAN_PIN_LENGTH))
                  }
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="••••"
                  className={pinInputClass}
                />
              </label>
            )}
            {pinPanel === 'set' && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-text-secondary">Новый PIN-код</span>
                {/* Said at the moment the PIN is chosen, not buried in a help
                    page: there is no recovery flow, and a parent who forgets
                    it can't turn the child mode off at all. */}
                <span className="text-xs text-text-secondary">
                  Запомните или запишите его — восстановить PIN-код нельзя.
                </span>
                <input
                  value={newPin}
                  onChange={(e) =>
                    setNewPin(e.target.value.replace(/\D/g, '').slice(0, GUARDIAN_PIN_LENGTH))
                  }
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="••••"
                  className={pinInputClass}
                />
              </label>
            )}

            {pinError && <p className="text-sm text-danger">{pinError}</p>}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setPinPanel('closed');
                  setPinError(null);
                  setNewPin('');
                  setCurrentPin('');
                }}
              >
                Отмена
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={
                  pinSaving ||
                  (user.guardianPinSet && !GUARDIAN_PIN_PATTERN.test(currentPin)) ||
                  (pinPanel === 'set' && !GUARDIAN_PIN_PATTERN.test(newPin))
                }
                onClick={() => void savePin(pinPanel === 'clear')}
              >
                {pinSaving ? 'Сохранение…' : pinPanel === 'clear' ? 'Удалить' : 'Сохранить'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
