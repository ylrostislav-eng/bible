'use client';

import { useEffect, useState } from 'react';
import { useIncomingChallenges } from '@/lib/incoming-challenges-context';
import { useIncomingDiceChallenges } from '@/lib/incoming-dice-challenges-context';
import { useIncomingHotColdChallenges } from '@/lib/incoming-hot-cold-challenges-context';
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
  const { challenges: diceChallenges, loaded: diceChallengesLoaded } = useIncomingDiceChallenges();
  const { challenges: hotColdChallenges, loaded: hotColdChallengesLoaded } =
    useIncomingHotColdChallenges();
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

  const loaded =
    invite?.kind === 'duel'
      ? challengesLoaded
      : invite?.kind === 'dice'
        ? diceChallengesLoaded
        : invite?.kind === 'hot-cold-duel'
          ? hotColdChallengesLoaded
          : invitesLoaded;
  const present =
    invite?.kind === 'duel'
      ? challenges.some((c) => c.sessionId === invite.sessionId)
      : invite?.kind === 'dice'
        ? diceChallenges.some((c) => c.matchId === invite.matchId)
        : invite?.kind === 'hot-cold-duel'
          ? hotColdChallenges.some((c) => c.duelId === invite.duelId)
          : invites.some((i) => invite && i.inviteId === invite.inviteId);

  /**
   * Ответ даётся один раз, вскоре после запуска, — и больше не
   * пересматривается.
   *
   * Иначе плашка вылезает ровно тогда, когда не надо: приглашение было
   * живо, человек его увидел и сам с ним разобрался (принял или отменил),
   * оно исчезло из списка — и «вызов уже неактуален, его отменили, пока вы
   * не открывали приложение» появляется поверх экрана как ложь. _Живой
   * случай владельца: отменил дуэль, и плашка повисла до перезагрузки._
   *
   * Вопрос, на который она отвечает, задаётся ровно в момент прихода по
   * ссылке: «было ли ещё что открывать». Дальше состояние меняет уже сам
   * человек, и к плашке это отношения не имеет.
   *
   * Отсчёт, а не «первый ответ сервера»: несколько секунд нужны, чтобы
   * опрос успел ответить (он ходит каждые четыре), и решение принимается
   * в колбэке таймера — установка состояния прямо в теле эффекта плодит
   * лишние волны рендера, о чём React Compiler и предупреждает.
   */
  const [decided, setDecided] = useState(false);
  useEffect(() => {
    const timeout = setTimeout(() => setDecided(true), DECISION_DELAY_MS);
    return () => clearTimeout(timeout);
  }, []);

  // Само исчезает: это сообщение вдогонку, а не разговор. Висящая
  // навсегда плашка перекрывает шапку и заставляет искать «Закрыть».
  useEffect(() => {
    if (!decided) return undefined;
    const timeout = setTimeout(() => setDismissed(true), AUTO_HIDE_MS);
    return () => clearTimeout(timeout);
  }, [decided]);

  // `loaded` в условии — против ложного «нет» на несмолкнувшем опросе:
  // если сервер за это время так и не ответил, промолчим.
  if (!invite || dismissed || !decided || !loaded || present) return null;

  return (
    // `--safe-top`, а не `env(safe-area-inset-top)`: в полноэкранном
    // режиме над экраном ещё и полоса кнопок Telegram («Закрыть», «⌄ •••»),
    // и `env()` о ней ничего не знает — плашка залезала прямо под них.
    <div className="app-band pointer-events-none fixed top-0 z-40 flex justify-center px-4 pt-[calc(var(--safe-top)+0.75rem)]">
      <div className="glass-card pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {invite.kind === 'room' ? 'Приглашение уже неактуально' : 'Вызов уже неактуален'}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            {invite.kind === 'room'
              ? 'Комната уже началась или закрылась. Загляните во вкладку «Игроки» — позовите сами.'
              : 'Его отменили или он истёк, пока вы не открывали приложение. Позовите в ответ — во вкладке «Игроки».'}
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

/** Сколько ждём, прежде чем ответить. Опрос приглашений ходит каждые
 * четыре секунды — этого хватает, чтобы узнать правду, и не настолько
 * много, чтобы ответ выглядел запоздалым. */
const DECISION_DELAY_MS = 5000;

/** Сколько плашка держится на экране. Хватает прочесть две строки и не
 * настолько долго, чтобы мешать. */
const AUTO_HIDE_MS = 8000;

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

  const key =
    invite.kind === 'duel'
      ? `duel_${invite.sessionId}`
      : invite.kind === 'dice'
        ? `dice_${invite.matchId}`
        : invite.kind === 'hot-cold-duel'
          ? `hot-cold_${invite.duelId}`
          : `room_${invite.inviteId}`;
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
