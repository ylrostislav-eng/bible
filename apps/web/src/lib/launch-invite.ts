import { retrieveLaunchParams } from '@telegram-apps/sdk-react';

/** На что показывала ссылка из уведомления. */
export type LaunchInvite =
  | { kind: 'duel'; sessionId: string }
  | { kind: 'room'; inviteId: string }
  | { kind: 'dice'; matchId: string }
  | { kind: 'hot-cold-duel'; duelId: string };

/**
 * Приглашение, с которым открыли приложение из уведомления бота.
 *
 * Префикс с подчёркиванием — не украшение: параметр один на все виды
 * ссылок, и без него первая же новая ссылка стала бы неотличима от старой.
 */
export function parseLaunchInvite(): LaunchInvite | null {
  // Два источника, потому что и открыть приложение можно двумя способами.
  //
  // Кнопка «Открыть вызов» под уведомлением открывает мини-приложение по
  // прямому адресу — приглашение приезжает обычным параметром адреса.
  // Ссылка `t.me/<бот>/app?startapp=…` кладёт то же самое в параметр
  // запуска Telegram. Основной способ — кнопка: ссылка ведёт в Main Mini
  // App, а он существует, только если назначен в BotFather, и без него
  // молча ничего не открывает.
  return parseInvite(queryInvite()) ?? parseInvite(startParamInvite());
}

function queryInvite(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('invite');
}

function startParamInvite(): string | null {
  try {
    return retrieveLaunchParams(true).tgWebAppStartParam ?? null;
  } catch {
    // Вне Telegram параметров запуска нет — обычное дело, не ошибка.
    return null;
  }
}

/**
 * Форматы: `duel_<id партии>`, `room_<id приглашения>`, `dice_<id партии>` и
 * `hot-cold_<id партии>`. Рядом живёт пятый, `ref_<токен>`, — он про
 * приглашение в друзья и разбирается на сервере при входе; здесь он
 * намеренно не наш случай и даёт `null`.
 */
function parseInvite(value: string | null): LaunchInvite | null {
  if (!value) return null;

  const duel = /^duel_([A-Za-z0-9_-]{1,64})$/.exec(value);
  if (duel) return { kind: 'duel', sessionId: duel[1] };

  const room = /^room_([A-Za-z0-9_-]{1,64})$/.exec(value);
  if (room) return { kind: 'room', inviteId: room[1] };

  const dice = /^dice_([A-Za-z0-9_-]{1,64})$/.exec(value);
  if (dice) return { kind: 'dice', matchId: dice[1] };

  const hotCold = /^hot-cold_([A-Za-z0-9_-]{1,64})$/.exec(value);
  if (hotCold) return { kind: 'hot-cold-duel', duelId: hotCold[1] };

  return null;
}
