'use client';

import {
  ADMIN_DELETE_CONFIRM_HINT,
  type AdminPlayerCard,
  type AdminPlayersResponse,
} from '@bible-arena/shared';
import { isGameMasterRole } from '@bible-arena/shared';
import { useCallback, useEffect, useState } from 'react';
import { RoleBadge } from '@/components/ui/role-badge';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { ApiError, apiClient } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatWhen } from './admin-panel-shell';

const SEARCH_DEBOUNCE_MS = 350;

/**
 * Игроки глазами администратора: поиск, карточка, действия.
 *
 * Здесь видно всех, включая детские аккаунты и тех, кто не выбрал ник, —
 * в отличие от вкладки «Игроки» у обычного человека. Это не дыра в
 * детской защите, а её обратная сторона: разбирать жалобу на аккаунт,
 * которого не видно, невозможно.
 */
export function AdminPlayersPanel() {
  const [query, setQuery] = useState('');
  const [list, setList] = useState<AdminPlayersResponse | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    try {
      const url = q.trim() ? `/admin/players?q=${encodeURIComponent(q.trim())}` : '/admin/players';
      setList(await apiClient.get<AdminPlayersResponse>(url));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить игроков');
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(query), query ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [query, load]);

  return (
    <div className="flex flex-col gap-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ник, @username, Telegram ID или id аккаунта"
        className="h-11 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
      />

      {error && <p className="text-sm text-danger">{error}</p>}
      {!list && !error && (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}

      {list?.players.length === 0 && (
        <p className="py-6 text-center text-sm text-text-secondary">Никого не нашлось</p>
      )}

      {list?.players.map((player) => (
        <Card key={player.userId} className="flex-col gap-2">
          <button
            onClick={() => setOpenId(openId === player.userId ? null : player.userId)}
            className="flex items-center justify-between gap-2 text-left"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={
                  player.online
                    ? 'h-2 w-2 shrink-0 rounded-full bg-success'
                    : 'h-2 w-2 shrink-0 rounded-full bg-text-muted'
                }
                aria-label={player.online ? 'В сети' : 'Не в сети'}
              />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                  {player.nickname ?? 'Без ника'}
                  <RoleBadge role={player.role} />
                </p>
                <p className="text-xs text-text-muted">
                  ур. {player.level} · знания {player.rating}
                  {player.mutedUntil ? ' · ограничен' : ''}
                </p>
              </div>
            </div>
            <span className="shrink-0 text-text-secondary">
              {openId === player.userId ? '▴' : '▾'}
            </span>
          </button>

          {openId === player.userId && (
            <PlayerDetails userId={player.userId} onChanged={() => void load(query)} />
          )}
        </Card>
      ))}

      {list?.truncated && (
        <p className="text-center text-xs text-text-muted">Показаны не все — уточните поиск</p>
      )}
    </div>
  );
}

function PlayerDetails({ userId, onChanged }: { userId: string; onChanged: () => void }) {
  // Необратимое — правка баланса и удаление — только у гейм-мастера.
  // Прятать эти поля от администратора надо не ради защиты (сервер
  // откажет в любом случае), а чтобы он не тратил время на кнопку,
  // которая ему всё равно ответит отказом.
  const { user } = useAuth();
  const master = isGameMasterRole(user?.role);

  const [card, setCard] = useState<AdminPlayerCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [muteHours, setMuteHours] = useState(24);
  const [nickname, setNickname] = useState('');
  const [coins, setCoins] = useState('');
  const [rating, setRating] = useState('');
  const [note, setNote] = useState('');
  const [confirmNickname, setConfirmNickname] = useState('');

  const reload = useCallback(async () => {
    try {
      setCard(await apiClient.get<AdminPlayerCard>(`/admin/players/${userId}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось открыть карточку');
    }
  }, [userId]);

  // Через таймер, а не прямым вызовом: React Compiler запрещает
  // `setState` в теле эффекта (`react-hooks/set-state-in-effect`), а
  // загрузка первым делом ставит состояние. Тот же приём уже используется
  // в списке игроков.
  useEffect(() => {
    const timer = setTimeout(() => void reload(), 0);
    return () => clearTimeout(timer);
  }, [reload]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не получилось');
    } finally {
      setBusy(false);
    }
  };

  if (!card) {
    return error ? (
      <p className="text-sm text-danger">{error}</p>
    ) : (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-text-secondary">
        <Field label="Telegram" value={card.telegramUsername ? `@${card.telegramUsername}` : '—'} />
        <Field label="Telegram ID" value={card.telegramId} />
        <Field label="Монеты" value={String(card.coins)} />
        <Field label="Опыт" value={String(card.experience)} />
        <Field label="Титул" value={card.title} />
        <Field label="Возраст" value={card.childMode ? 'детский режим' : (card.ageBand ?? '—')} />
        <Field label="Партий" value={String(card.gamesPlayed)} />
        <Field label="Дуэлей" value={`${card.gamesWon}/${card.gamesLost}/${card.gamesDrawn}`} />
        <Field label="Серия" value={`${card.currentStreak} (макс. ${card.longestStreak})`} />
        <Field label="Был(а)" value={formatWhen(card.lastActiveAt)} />
        <Field label="Регистрация" value={formatWhen(card.createdAt)} />
        <Field
          label="Жалобы"
          value={`${card.reportsAgainst} (на разборе ${card.reportsPending})`}
        />
      </div>

      {card.mutedUntil && (
        <p className="text-xs text-warning">Ограничен до {formatWhen(card.mutedUntil)}</p>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* Ограничение */}
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Ограничить, часов
          <input
            type="number"
            min={1}
            value={muteHours}
            onChange={(e) => setMuteHours(Math.max(1, Number(e.target.value) || 1))}
            className="h-9 w-24 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <button
          disabled={busy}
          onClick={() =>
            void run(() => apiClient.post(`/admin/players/${userId}/mute`, { hours: muteHours }))
          }
          className="h-9 rounded-lg bg-surface-hover px-3 text-xs font-semibold disabled:opacity-50"
        >
          Ограничить
        </button>
        {card.mutedUntil && (
          <button
            disabled={busy}
            onClick={() => void run(() => apiClient.post(`/admin/players/${userId}/unmute`))}
            className="h-9 rounded-lg bg-surface-hover px-3 text-xs font-semibold disabled:opacity-50"
          >
            Снять
          </button>
        )}
      </div>

      {/* Ник */}
      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs text-text-secondary">
          Новый ник
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={card.nickname ?? ''}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <button
          disabled={busy || nickname.trim().length === 0}
          onClick={() =>
            void run(async () => {
              await apiClient.patch(`/admin/players/${userId}/nickname`, {
                nickname: nickname.trim(),
              });
              setNickname('');
            })
          }
          className="h-9 rounded-lg bg-surface-hover px-3 text-xs font-semibold disabled:opacity-50"
        >
          Сменить
        </button>
      </div>

      {/* Баланс — необратимое, поэтому у гейм-мастера */}
      {master && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-text-secondary">Правка баланса — со знаком: «-50» списывает</p>
          <div className="flex gap-2">
            <input
              value={coins}
              onChange={(e) => setCoins(e.target.value)}
              placeholder="монеты"
              inputMode="numeric"
              className="h-9 w-24 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary"
            />
            <input
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              placeholder="знания"
              inputMode="numeric"
              className="h-9 w-24 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary"
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="за что"
              className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <button
            disabled={busy || (!coins.trim() && !rating.trim())}
            onClick={() =>
              void run(async () => {
                await apiClient.post(`/admin/players/${userId}/balance`, {
                  coins: coins.trim() ? Number(coins) : undefined,
                  rating: rating.trim() ? Number(rating) : undefined,
                  note: note.trim() || undefined,
                });
                setCoins('');
                setRating('');
                setNote('');
              })
            }
            className="h-9 rounded-lg bg-surface-hover text-xs font-semibold disabled:opacity-50"
          >
            Применить
          </button>
        </div>
      )}

      {/* Удаление */}
      {master && card.role === 'PLAYER' && (
        <div className="flex flex-col gap-2 rounded-xl border border-danger/40 p-2">
          <p className="text-xs text-danger">{ADMIN_DELETE_CONFIRM_HINT}</p>
          <div className="flex gap-2">
            <input
              value={confirmNickname}
              onChange={(e) => setConfirmNickname(e.target.value)}
              placeholder={card.nickname ?? ''}
              className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-danger"
            />
            <button
              disabled={busy || confirmNickname.trim() !== (card.nickname ?? '')}
              onClick={() =>
                void run(() =>
                  apiClient.delete(`/admin/players/${userId}`, {
                    confirmNickname: confirmNickname.trim(),
                  }),
                )
              }
              className="h-9 shrink-0 rounded-lg bg-danger px-3 text-xs font-semibold text-bg disabled:opacity-50"
            >
              Удалить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <p className="truncate">
      <span className="text-text-muted">{label}: </span>
      <span className="text-text-primary">{value}</span>
    </p>
  );
}
