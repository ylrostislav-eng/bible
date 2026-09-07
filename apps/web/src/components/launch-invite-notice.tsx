'use client';

import { useState } from 'react';
import { useIncomingChallenges } from '@/lib/incoming-challenges-context';
import { useIncomingRoomInvites } from '@/lib/incoming-room-invites-context';
import { parseLaunchInvite, type LaunchInvite } from '@/lib/launch-invite';

/**
 * Честный ответ тому, кто пришёл по ссылке из уведомления, а приглашения
 * там уже нет.
 *
 * Когда приглашение живо, показывать нечего: его и так покажет
 * `IncomingNotifications` — попап работает на любом экране и опрашивает
 * сервер каждые несколько секунд. Ссылка ведёт на главную, и приглашение
 * появляется перед глазами само.
 *
 * А вот обратный случай молчал бы. Вызов живёт полчаса (см. уборку
 * брошенных партий), приглашение исчезает вместе с комнатой, и человек,
 * открывший уведомление позже, попадал бы на обычную главную без всяких
 * следов того, зачем он сюда шёл. Пустой экран в ответ на «вас вызывают»
 * читается как поломка приложения, а не как «уже поздно».
 *
 * Ждём первого ответа сервера, а не просто пустого списка: до него пустота
 * значит «ещё не знаем».
 */
export function LaunchInviteNotice() {
  const { challenges, loaded: challengesLoaded } = useIncomingChallenges();
  const { invites, loaded: invitesLoaded } = useIncomingRoomInvites();

  // Читается ленивым инициализатором, а не в эффекте: параметр запуска не
  // меняется за жизнь страницы, это не подписка на внешнее состояние, и
  // установка состояния из эффекта здесь дала бы лишний каскад рендеров
  // (на что справедливо ругается React Compiler).
  //
  // На сервере окна нет, и там ответ всегда пустой. Расхождения при
  // гидратации это не создаёт: пока не прошёл первый опрос, компонент
  // всё равно ничего не рисует.
  const [invite] = useState<LaunchInvite | null>(() =>
    typeof window === 'undefined' ? null : takeLaunchInviteOnce(),
  );
  const [dismissed, setDismissed] = useState(false);

  if (!invite || dismissed) return null;

  const gone =
    invite.kind === 'duel'
      ? challengesLoaded && !challenges.some((c) => c.sessionId === invite.sessionId)
      : invitesLoaded && !invites.some((i) => i.inviteId === invite.inviteId);

  if (!gone) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
      <div className="glass-card pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {invite.kind === 'duel' ? 'Вызов уже неактуален' : 'Приглашение уже неактуально'}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            {invite.kind === 'duel'
              ? 'Его отменили или он истёк, пока вы не открывали приложение. Позовите в ответ — во вкладке «Игроки».'
              : 'Комната уже началась или закрылась. Загляните во вкладку «Игроки» — позовите сами.'}
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="ml-auto shrink-0 text-xs text-text-muted"
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}

/** Ключ, которым помечается уже отработанный параметр запуска. */
const HANDLED_KEY = 'bible-arena:launch-invite-handled';

/**
 * Ответ, уже посчитанный в этой загрузке страницы.
 *
 * Нужен из-за StrictMode: в разработке React монтирует компонент дважды,
 * и второй вызов видел бы пометку, поставленную первым, — то есть
 * приглашение считалось бы уже показанным ещё до показа. _Поймано живой
 * проверкой: после добавления пометки плашка перестала появляться вовсе._
 * Отдельная переменная модуля живёт ровно столько же, сколько загрузка
 * страницы, — то есть ровно один запуск приложения.
 */
let cachedInvite: LaunchInvite | null | undefined;

/**
 * Параметр запуска — одноразовый, и это приходится помнить самим.
 *
 * SDK Telegram кеширует параметры запуска на всю сессию вкладки: они
 * остаются доступными и после перезагрузки страницы, когда человек уже
 * давно ходит по приложению обычным образом. Без пометки плашка «вызов
 * неактуален» всплывала бы снова на каждую перезагрузку — _поймано живой
 * проверкой: после захода без ссылки она появилась опять._
 *
 * Пометка живёт в `sessionStorage`, а не в состоянии: состояние
 * перезагрузку не переживает, а параметр — переживает.
 */
function takeLaunchInviteOnce(): LaunchInvite | null {
  if (cachedInvite !== undefined) return cachedInvite;

  const invite = parseLaunchInvite();
  if (!invite) {
    cachedInvite = null;
    return null;
  }

  const key = invite.kind === 'duel' ? `duel_${invite.sessionId}` : `room_${invite.inviteId}`;
  try {
    if (sessionStorage.getItem(HANDLED_KEY) === key) {
      cachedInvite = null;
      return null;
    }
    sessionStorage.setItem(HANDLED_KEY, key);
  } catch {
    // Хранилище недоступно (приватный режим) — тогда просто показываем.
    // Лишняя плашка лучше, чем молчание в ответ на «вас вызывают».
  }
  cachedInvite = invite;
  return invite;
}
