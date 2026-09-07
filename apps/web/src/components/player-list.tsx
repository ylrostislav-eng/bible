'use client';

import type {
  BannedUserView,
  ChallengeFriendResponse,
  PlayersListResponse,
  PlayerView,
} from '@bible-arena/shared';
import {
  DUEL_QUESTION_COUNT_DEFAULT,
  DUEL_QUESTION_COUNT_MAX,
  DUEL_QUESTION_COUNT_MIN,
} from '@bible-arena/shared';
import { isChildBand } from '@bible-arena/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ApiError, apiClient } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { NO_NICKNAME_HINT, playerName } from '@/lib/player-name';
import { Card } from './ui/card';
import { QuestionCountSlider } from './ui/question-count-slider';
import { Spinner } from './ui/spinner';
import { UserActionSheet } from './user-action-sheet';

const SEARCH_DEBOUNCE_MS = 350;
/** Кто в сети — меняется в любой момент и другого сигнала обновиться нет. */
const LIST_POLL_MS = 15000;

interface PlayerListProps {
  /**
   * Что делает главная кнопка строки: позвать на дуэль (вкладка «Игроки» и
   * экран дуэли) или пригласить в уже созданную комнату (лобби).
   */
  mode: 'challenge' | 'invite';
  /** Вызывается после успешного вызова, с id новой партии. Что делать
   * дальше — решает тот, кто встроил список: у вкладки и у экрана дуэли
   * это разные переходы. */
  onChallengeSent?: (sessionId: string) => void;
  /** Приглашение в комнату — одно нажатие, без настроек. */
  onInvite?: (userId: string) => Promise<void>;
  /** Уже в комнате: показывать их бессмысленно. */
  excludeUserIds?: string[];
  /** Довесок в конце строки — например «Убрать» у своих. */
  renderPlayerExtra?: (player: PlayerView) => ReactNode;
}

/**
 * Список игроков приложения: поиск по нику, сначала те, кто в сети.
 *
 * Пришёл на смену `FriendChallengeList`, который показывал только друзей.
 * Причина не в вёрстке: вызвать можно было лишь друга, поэтому «сыграть с
 * незнакомцем» означало отправить заявку и ждать ответа. Теперь позвать
 * можно любого, а дружба осталась пометкой «свой» — она поднимает человека
 * в отдельный раздел, а не открывает дверь.
 *
 * Разделение на «в сети» и «не в сети» — не украшение: на вкладку заходят с
 * вопросом «с кем сыграть прямо сейчас», и ответ на него даёт только первый
 * раздел.
 */
export function PlayerList({
  mode,
  onChallengeSent,
  onInvite,
  excludeUserIds,
  renderPlayerExtra,
}: PlayerListProps) {
  // Детский режим меняет не список, а объяснение к нему: сервер и так
  // показывает ребёнку только своих, но без этой оговорки экран говорит
  // ребёнку правила взрослого — «зовите любого» и «никто не найден,
  // проверьте ник», хотя искать среди незнакомых ему нельзя вовсе.
  const { user } = useAuth();
  const child = isChildBand(user?.ageBand);

  const [data, setData] = useState<PlayersListResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bannedIds, setBannedIds] = useState<Set<string>>(new Set());

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const [actionSheetFor, setActionSheetFor] = useState<PlayerView | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  const [challengingId, setChallengingId] = useState<string | null>(null);
  const [challengeQuestionCount, setChallengeQuestionCount] = useState(DUEL_QUESTION_COUNT_DEFAULT);
  const [challengeSending, setChallengeSending] = useState(false);
  const [challengeError, setChallengeError] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    const url = q.trim() ? `/players?q=${encodeURIComponent(q.trim())}` : '/players';
    const list = await apiClient.get<PlayersListResponse>(url);
    setData(list);
    setLoadError(null);
  }, []);

  // Поиск и обычный список — один и тот же запрос: два списка с разными
  // правилами на одном экране расходятся между собой, и человек видит
  // игрока в поиске, но не видит в списке.
  useEffect(() => {
    let cancelled = false;
    const q = query.trim();

    async function run() {
      if (!cancelled && q.length > 0) setSearching(true);
      try {
        await load(query);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : 'Не удалось загрузить игроков');
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }

    const timeout = setTimeout(() => void run(), q.length === 0 ? 0 : SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, load]);

  // Обновление «кто в сети» — только для списка без поиска: перезапрашивать
  // результаты поиска под руками у человека значит менять их, пока он на
  // них смотрит.
  useEffect(() => {
    if (query.trim().length > 0) return;
    const interval = setInterval(() => {
      void load('').catch(() => {
        // Молча: список уже нарисован, а ошибку опроса показывать не за что.
      });
    }, LIST_POLL_MS);
    return () => clearInterval(interval);
  }, [query, load]);

  useEffect(() => {
    let cancelled = false;
    void apiClient
      .get<BannedUserView[]>('/rooms/banned')
      .then((banned) => {
        if (!cancelled) setBannedIds(new Set(banned.map((b) => b.userId)));
      })
      .catch(() => {
        // Чёрный список — довесок к строке, а не сам экран.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addFriend = async (userId: string) => {
    setBusyId(userId);
    try {
      await apiClient.post('/friends/requests', { toUserId: userId });
      await load(query);
    } finally {
      setBusyId(null);
    }
  };

  const toggleBan = async (userId: string) => {
    setActionBusy(true);
    try {
      if (bannedIds.has(userId)) {
        await apiClient.delete(`/rooms/banned/${userId}`);
        setBannedIds((ids) => {
          const next = new Set(ids);
          next.delete(userId);
          return next;
        });
      } else {
        await apiClient.post('/rooms/banned', { userId });
        setBannedIds((ids) => new Set(ids).add(userId));
      }
      setActionSheetFor(null);
      await load(query);
    } finally {
      setActionBusy(false);
    }
  };

  const sendChallenge = async () => {
    if (!challengingId) return;
    setChallengeSending(true);
    setChallengeError(null);
    try {
      const res = await apiClient.post<ChallengeFriendResponse>('/game/duel/challenge', {
        friendUserId: challengingId,
        questionCount: challengeQuestionCount,
      });
      onChallengeSent?.(res.sessionId);
    } catch (err) {
      setChallengeError(err instanceof ApiError ? err.message : 'Не удалось отправить вызов');
      setChallengeSending(false);
    }
  };

  const invite = async (userId: string) => {
    if (!onInvite) return;
    setBusyId(userId);
    try {
      await onInvite(userId);
      setInvitedIds((ids) => new Set(ids).add(userId));
    } catch {
      // Текст ошибки показывает тот, кто передал `onInvite`, — он знает,
      // куда её положить на своём экране. Здесь ошибку надо погасить, иначе
      // она уедет в необработанное отклонение промиса.
    } finally {
      setBusyId(null);
    }
  };

  const excluded = new Set(excludeUserIds ?? []);
  const visible = (data?.players ?? []).filter((p) => !excluded.has(p.userId));
  const online = visible.filter((p) => p.online);
  const offline = visible.filter((p) => !p.online);

  const renderRow = (player: PlayerView) => (
    <div key={player.userId} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setActionSheetFor(player)}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <span
            className={
              player.online
                ? 'h-2 w-2 shrink-0 rounded-full bg-success'
                : 'h-2 w-2 shrink-0 rounded-full bg-text-muted'
            }
            aria-label={player.online ? 'В сети' : 'Не в сети'}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {playerName(player.nickname)}
              {player.relation === 'friend' && (
                <span className="ml-1.5 align-middle text-[10px] font-medium text-primary">
                  свой
                </span>
              )}
            </p>
            <p className="text-xs text-text-muted">
              {player.nickname ? `${player.title} · ур. ${player.level}` : NO_NICKNAME_HINT}
            </p>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-3">
          {mode === 'challenge' && player.canInvite && (
            <button
              onClick={() => {
                setChallengingId(player.userId);
                setChallengeQuestionCount(DUEL_QUESTION_COUNT_DEFAULT);
                setChallengeError(null);
              }}
              className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-on-primary"
            >
              Вызвать
            </button>
          )}
          {mode === 'invite' &&
            player.canInvite &&
            (invitedIds.has(player.userId) ? (
              <span className="text-xs text-text-muted">Приглашён</span>
            ) : (
              <button
                onClick={() => void invite(player.userId)}
                disabled={busyId === player.userId}
                className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-on-primary disabled:opacity-50"
              >
                Пригласить
              </button>
            ))}
          {renderPlayerExtra?.(player)}
        </div>
      </div>

      {challengingId === player.userId && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-hover p-3">
          <QuestionCountSlider
            label="Количество вопросов"
            value={challengeQuestionCount}
            min={DUEL_QUESTION_COUNT_MIN}
            max={DUEL_QUESTION_COUNT_MAX}
            onChange={setChallengeQuestionCount}
          />
          {/* Честно про то, что будет дальше: вызов не пропадёт, но и
              мгновенного ответа не будет — без этой строки человек ждёт
              реакции, которой не случится. */}
          {!player.online && (
            <p className="text-xs text-text-muted">
              Игрок не в сети — вызов будет ждать его на экране дуэли.
            </p>
          )}
          {challengeError && <p className="text-sm text-danger">{challengeError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => void sendChallenge()}
              disabled={challengeSending}
              className="h-10 flex-1 rounded-lg bg-primary text-sm font-semibold text-on-primary disabled:opacity-50"
            >
              {challengeSending ? 'Отправка…' : 'Бросить вызов'}
            </button>
            <button
              onClick={() => setChallengingId(null)}
              disabled={challengeSending}
              className="h-10 rounded-lg bg-surface px-3 text-sm text-text-secondary disabled:opacity-50"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">Найти по нику</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Введите игровой никнейм…"
          className="h-12 rounded-xl border border-border bg-surface px-4 text-sm outline-none focus:border-primary"
        />
      </label>

      {query.trim().length === 1 && (
        <p className="-mt-3 text-xs text-text-muted">Введите ещё хотя бы один символ</p>
      )}

      {loadError && <p className="text-sm text-danger">{loadError}</p>}

      {!data || searching ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : visible.length === 0 ? (
        <p className="pt-4 text-center text-sm text-text-secondary">
          {query.trim()
            ? child
              ? 'Поиск ищет только среди своих. Чтобы добавить нового человека, отправьте ему ссылку-приглашение ниже.'
              : 'Никто не найден — проверьте, что ищете по игровому нику, а не по имени в Telegram'
            : 'Пока никого нет. Позовите своих по ссылке ниже.'}
        </p>
      ) : (
        <>
          {online.length > 0 && (
            <Card className="flex-col gap-3">
              <p className="text-sm font-semibold text-text-secondary">В сети · {online.length}</p>
              {online.map(renderRow)}
            </Card>
          )}
          {offline.length > 0 && (
            <Card className="flex-col gap-3">
              <p className="text-sm font-semibold text-text-secondary">Не в сети</p>
              {offline.map(renderRow)}
            </Card>
          )}
          {data.truncated && (
            <p className="text-center text-xs text-text-muted">
              Показаны не все — найдите нужного по нику
            </p>
          )}
        </>
      )}

      {actionSheetFor && (
        <UserActionSheet
          nickname={actionSheetFor.nickname}
          userId={actionSheetFor.userId}
          isBanned={bannedIds.has(actionSheetFor.userId)}
          busy={actionBusy || busyId === actionSheetFor.userId}
          onClose={() => setActionSheetFor(null)}
          onAddFriend={
            actionSheetFor.relation === 'none'
              ? () => void addFriend(actionSheetFor.userId).then(() => setActionSheetFor(null))
              : undefined
          }
          onToggleBan={() => void toggleBan(actionSheetFor.userId)}
        />
      )}
    </div>
  );
}
