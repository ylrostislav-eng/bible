'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { isChildBand, type FriendsListResponse } from '@bible-arena/shared';
import { FriendsIcon } from '@/components/icons/nav-icons';
import { InviteFriendsCard } from '@/components/invite-friends-card';
import { PlayerList } from '@/components/player-list';
import { Card } from '@/components/ui/card';
import { ScreenIcon } from '@/components/ui/screen-icon';
import { ApiError, apiClient } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { playerName } from '@/lib/player-name';

/** Matches the key `/play/duel` reads on mount to pick up a
 * challenge-created session without a URL param. */
const PENDING_SESSION_STORAGE_KEY = 'bible-arena:pending-duel-session';

/**
 * Вкладка «Игроки» — бывшая «Друзья».
 *
 * Переименована не ради слова: вызвать теперь можно любого, и вкладка,
 * названная «Друзья», обещала бы обратное — что сначала надо подружиться.
 * Дружба осталась, но переехала в заявки и в пометку «свой» у строки: это
 * список своих людей, а не пропуск.
 *
 * Заявки показаны здесь же, а не спрятаны: они перестали быть шагом на пути
 * к игре, но остались тем, на что человек должен ответить.
 */
export default function PlayersPage() {
  const router = useRouter();
  const { user } = useAuth();
  const child = isChildBand(user?.ageBand);

  const [overview, setOverview] = useState<FriendsListResponse | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Пересобирает список игроков после «Принять»/«Убрать»: сам он обновится
  // только следующим опросом, и до тех пор строка показывала бы отношение,
  // которого уже нет.
  const [refreshKey, setRefreshKey] = useState(0);

  const loadOverview = useCallback(async () => {
    try {
      const data = await apiClient.get<FriendsListResponse>('/friends');
      setOverview(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Не удалось загрузить заявки');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Ссылка-приглашение берётся тем же заходом, что и заявки: своим
      // запросом она приходила позже всего, и карточка «Позвать друзей»
      // появлялась последней, сдвигая уже нарисованную страницу.
      //
      // `allSettled`, а не `all`: приглашение — необязательная часть экрана,
      // и его неудача не должна утаскивать за собой остальное.
      const [list, invite] = await Promise.allSettled([
        apiClient.get<FriendsListResponse>('/friends'),
        apiClient.get<{ link: string | null }>('/friends/invite-link'),
      ]);
      if (cancelled) return;
      if (invite.status === 'fulfilled') setInviteLink(invite.value.link);
      if (list.status === 'fulfilled') {
        setOverview(list.value);
        setLoadError(null);
      } else {
        setLoadError('Не удалось загрузить заявки');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const withBusy = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    try {
      await action();
      await loadOverview();
      setRefreshKey((k) => k + 1);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-6">
      <div className="flex items-center gap-3">
        <ScreenIcon icon={FriendsIcon} />
        <div>
          <h1 className="text-xl font-bold">Игроки</h1>
          {/* Подпись читается как правило экрана, поэтому она разная: в
              детском режиме «зовите любого» — прямая неправда, там видно
              только своих. */}
          <p className="text-sm text-text-secondary">
            {child
              ? 'Здесь только свои — те, кого вы добавили'
              : 'Позовите любого — дружба не нужна'}
          </p>
        </div>
      </div>

      {loadError && <p className="text-sm text-danger">{loadError}</p>}

      {overview && overview.incomingRequests.length > 0 && (
        <Card className="flex-col gap-3">
          <p className="text-sm font-semibold text-text-secondary">Входящие заявки</p>
          {overview.incomingRequests.map((req) => (
            <div key={req.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{playerName(req.nickname)}</p>
                <p className="text-xs text-text-muted">
                  {req.title} · ур. {req.level}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() =>
                    void withBusy(req.id, () =>
                      apiClient.post(`/friends/requests/${req.id}/accept`),
                    )
                  }
                  disabled={busyId === req.id}
                  className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-on-primary disabled:opacity-50"
                >
                  Принять
                </button>
                <button
                  onClick={() =>
                    void withBusy(req.id, () =>
                      apiClient.post(`/friends/requests/${req.id}/decline`),
                    )
                  }
                  disabled={busyId === req.id}
                  className="h-9 rounded-lg bg-surface-hover px-3 text-xs font-semibold text-text-secondary disabled:opacity-50"
                >
                  Отклонить
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <PlayerList
        key={refreshKey}
        mode="challenge"
        onChallengeSent={(sessionId) => {
          sessionStorage.setItem(PENDING_SESSION_STORAGE_KEY, sessionId);
          router.push('/play/duel');
        }}
        renderPlayerExtra={(player) =>
          player.relation === 'friend' ? (
            <button
              onClick={() =>
                void withBusy(player.userId, () => apiClient.delete(`/friends/${player.userId}`))
              }
              disabled={busyId === player.userId}
              className="text-xs text-text-muted hover:text-danger disabled:opacity-50"
            >
              Убрать
            </button>
          ) : null
        }
      />

      {/* Внизу, а не вверху: список игроков теперь не пустой с первого дня,
          и «где брать людей» перестало быть первым вопросом экрана. Но
          позвать своих по-прежнему хочется — просто это уже не спасение от
          пустоты, а отдельное желание. */}
      <InviteFriendsCard link={inviteLink} />
    </div>
  );
}
