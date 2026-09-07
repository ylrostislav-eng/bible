import { retrieveLaunchParams } from '@telegram-apps/sdk-react';

/** На что показывала ссылка из уведомления. */
export type LaunchInvite = { kind: 'duel'; sessionId: string } | { kind: 'room'; inviteId: string };

/**
 * Разбирает параметр запуска ссылки из уведомления бота.
 *
 * Форматы: `duel_<id партии>` и `room_<id приглашения>`. Рядом живёт
 * третий, `ref_<токен>`, — он про приглашение в друзья и разбирается на
 * сервере при входе; здесь он намеренно не наш случай и даёт `null`.
 *
 * Префикс с подчёркиванием — не украшение: параметр запуска один на все
 * виды ссылок, и без него первая же новая ссылка стала бы неотличима от
 * старой.
 */
export function parseLaunchInvite(): LaunchInvite | null {
  let startParam: string | undefined;
  try {
    startParam = retrieveLaunchParams(true).tgWebAppStartParam;
  } catch {
    // Вне Telegram параметра нет — обычное дело, не ошибка.
    return null;
  }
  if (!startParam) return null;

  const duel = /^duel_([A-Za-z0-9_-]{1,64})$/.exec(startParam);
  if (duel) return { kind: 'duel', sessionId: duel[1] };

  const room = /^room_([A-Za-z0-9_-]{1,64})$/.exec(startParam);
  if (room) return { kind: 'room', inviteId: room[1] };

  return null;
}
