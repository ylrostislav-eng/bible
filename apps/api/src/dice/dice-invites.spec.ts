import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AdminRegistry } from '../auth/admin-registry.service';
import type { StaffNameMask } from '../auth/staff-name-mask.service';
import type { ContactPolicyService } from '../contact/contact-policy.service';
import type { InviteNotifierService } from '../notifications/invite-notifier.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { UsersService } from '../users/users.service';
import { DiceService } from './dice.service';

/**
 * Персональные приглашения в «Кости» — задача #1 из трекера.
 *
 * Промежуточный коммит добавил экран «Кого пригласить?» и API
 * (`/dice/challenge`, `/dice/pending-invites`, `/dice/:id/respond`), но не
 * тесты и не атомарность отклонения — задача прямо требовала не считать
 * её завершённой без них. Набор написан по чек-листу задачи: приглашение
 * самому себе, ограничения контактов, повторный вызов, вход постороннего,
 * принятие, отклонение и гонка accept/decline.
 *
 * База — не настоящий Prisma, а заглушка ровно на те запросы, которые
 * `DiceService` в самом деле выполняет: она хранит партии и игроков в
 * массивах и разбирает `where` только для тех форм, что встречаются в
 * коде сервиса. Это не эмулятор Prisma целиком, а честная модель именно
 * этих правил — тот же приём, что и в `shop-rules.spec.ts`.
 */

interface MatchRow {
  id: string;
  inviteCode: string;
  targetScore: number;
  turnTimeLimit: number | null;
  botDifficulty: string | null;
  status: 'WAITING' | 'IN_PROGRESS' | 'FINISHED' | 'ABANDONED';
  state: unknown;
  openToMatchmaking: boolean;
  targetOpponentId: string | null;
  rematchOfId: string | null;
  winnerId: string | null;
  version: number;
  turnStartedAt: Date | null;
  botActionAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastActionAt: Date;
  lastActionId: string | null;
  lastEvents: unknown;
  createdAt: Date;
}

interface PlayerRow {
  id: string;
  matchId: string;
  userId: string;
  seat: number;
  score: number;
  bustCount: number;
  hotDiceCount: number;
  bestTurn: number;
  joinedAt: Date;
}

interface UserRow {
  id: string;
  nickname: string | null;
  ageBand: string | null;
  telegramId: bigint;
  avatarUrl: string | null;
  lampFlame: string | null;
  lampVessel: string | null;
  lampGlow: string | null;
}

/** Заглушка контактов: пропускает всех, если не сказано иначе — реальные
 * правила бана/детского режима проверены отдельно, в
 * `contact-policy.spec.ts`. Здесь важно только то, что `DiceService`
 * действительно спрашивает и действительно слушает ответ. */
function fakeContacts(deny?: (from: string, to: string) => string | null) {
  return {
    assertCanReach: jest.fn((from: string, to: string) => {
      const reason = deny?.(from, to);
      if (reason) throw new ForbiddenException(reason);
      return Promise.resolve();
    }),
    reachableAmong: jest.fn(() => Promise.resolve(new Set<string>())),
  } as unknown as ContactPolicyService;
}

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}${++idCounter}`;

function fakeDb(users: UserRow[]) {
  const matches: MatchRow[] = [];
  const players: PlayerRow[] = [];
  const usersById = new Map(users.map((u) => [u.id, u]));

  function withPlayers(match: MatchRow) {
    return { ...match, players: players.filter((p) => p.matchId === match.id) };
  }

  function matchesWhere(where: Record<string, unknown>): MatchRow[] {
    return matches.filter((m) => {
      if (where.id !== undefined && m.id !== where.id) return false;
      if (where.inviteCode !== undefined && m.inviteCode !== where.inviteCode)
        return false;
      if (where.status !== undefined) {
        const status = where.status as string | { in?: string[] };
        if (typeof status === 'string') {
          if (m.status !== status) return false;
        } else if (status?.in && !status.in.includes(m.status)) return false;
      }
      if (
        where.targetOpponentId !== undefined &&
        m.targetOpponentId !== where.targetOpponentId
      )
        return false;
      if (
        where.rematchOfId !== undefined &&
        m.rematchOfId !== where.rematchOfId
      )
        return false;
      const playersFilter = where.players as
        { some?: { userId: string } } | undefined;
      if (playersFilter?.some) {
        const hasPlayer = players.some(
          (p) => p.matchId === m.id && p.userId === playersFilter.some!.userId,
        );
        if (!hasPlayer) return false;
      }
      return true;
    });
  }

  const diceMatch = {
    findFirst: jest.fn(
      ({
        where,
        orderBy,
      }: {
        where: Record<string, unknown>;
        orderBy?: { lastActionAt?: 'asc' | 'desc' };
      }) => {
        const found = matchesWhere(where);
        if (orderBy?.lastActionAt === 'desc') {
          found.sort(
            (a, b) => b.lastActionAt.getTime() - a.lastActionAt.getTime(),
          );
        }
        return found[0] ? withPlayers(found[0]) : null;
      },
    ),
    findMany: jest.fn(
      ({
        where,
        orderBy,
      }: {
        where: Record<string, unknown>;
        orderBy?: { createdAt?: 'asc' | 'desc' };
      }) => {
        const found = matchesWhere(where).map(withPlayers);
        if (orderBy?.createdAt === 'desc') {
          found.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        } else if (orderBy?.createdAt === 'asc') {
          found.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        return found.map((m) => ({
          ...m,
          players: m.players.map((p) => ({
            ...p,
            user: usersById.get(p.userId) ?? null,
          })),
        }));
      },
    ),
    findUnique: jest.fn(({ where }: { where: Record<string, unknown> }) => {
      const found = matchesWhere(where)[0];
      return found ? withPlayers(found) : null;
    }),
    create: jest.fn(
      ({
        data,
      }: {
        data: Record<string, unknown> & {
          players?: { create?: { userId: string; seat: number } };
        };
      }) => {
        const { players: playersInput, ...rest } = data;
        const match: MatchRow = {
          id: rest.id as string,
          inviteCode: rest.inviteCode as string,
          targetScore: rest.targetScore as number,
          turnTimeLimit: (rest.turnTimeLimit as number | null) ?? null,
          botDifficulty: (rest.botDifficulty as string | null) ?? null,
          status: rest.status as MatchRow['status'],
          state: rest.state,
          openToMatchmaking: (rest.openToMatchmaking as boolean) ?? false,
          targetOpponentId: (rest.targetOpponentId as string | null) ?? null,
          rematchOfId: (rest.rematchOfId as string | null) ?? null,
          winnerId: null,
          version: 0,
          turnStartedAt: (rest.turnStartedAt as Date | null) ?? null,
          botActionAt: (rest.botActionAt as Date | null) ?? null,
          startedAt: (rest.startedAt as Date | null) ?? null,
          finishedAt: null,
          lastActionAt: new Date(),
          lastActionId: null,
          lastEvents: [],
          createdAt: new Date(),
        };
        matches.push(match);
        if (playersInput?.create) {
          players.push({
            id: nextId('player'),
            matchId: match.id,
            userId: playersInput.create.userId,
            seat: playersInput.create.seat,
            score: 0,
            bustCount: 0,
            hotDiceCount: 0,
            bestTurn: 0,
            joinedAt: new Date(),
          });
        }
        return withPlayers(match);
      },
    ),
    update: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const match = matches.find((m) => m.id === where.id);
        if (!match) throw new Error('матч не найден в заглушке');
        for (const [key, value] of Object.entries(data)) {
          if (
            key === 'version' &&
            value &&
            typeof value === 'object' &&
            'increment' in value
          ) {
            match.version += (value as { increment: number }).increment;
          } else {
            (match as unknown as Record<string, unknown>)[key] = value;
          }
        }
        return withPlayers(match);
      },
    ),
  };

  const diceMatchPlayer = {
    create: jest.fn(
      ({ data }: { data: Omit<PlayerRow, 'id' | 'joinedAt'> }) => {
        const row: PlayerRow = {
          ...data,
          id: nextId('player'),
          joinedAt: new Date(),
        };
        players.push(row);
        return row;
      },
    ),
    update: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<PlayerRow>;
      }) => {
        const row = players.find((p) => p.id === where.id);
        if (!row) throw new Error('игрок не найден в заглушке');
        Object.assign(row, data);
        return row;
      },
    ),
  };

  const actions: Array<{
    matchId: string;
    userId: string;
    actionId: string;
    payload: unknown;
  }> = [];
  const diceMatchAction = {
    findUnique: jest.fn(
      ({
        where,
      }: {
        where: {
          matchId_userId_actionId: {
            matchId: string;
            userId: string;
            actionId: string;
          };
        };
      }) => {
        const key = where.matchId_userId_actionId;
        return (
          actions.find(
            (a) =>
              a.matchId === key.matchId &&
              a.userId === key.userId &&
              a.actionId === key.actionId,
          ) ?? null
        );
      },
    ),
    create: jest.fn(
      ({
        data,
      }: {
        data: {
          matchId: string;
          userId: string;
          actionId: string;
          payload: unknown;
        };
      }) => {
        actions.push(data);
        return data;
      },
    ),
  };

  const diceRoll = { create: jest.fn(() => undefined) };

  const user = {
    findUnique: jest.fn(({ where }: { where: { id: string } }) => {
      const row = usersById.get(where.id);
      // `select` не разбирается: заглушке всё равно, каким запросом
      // спрашивают — проверкой существования или ником для уведомления.
      return row ? { id: row.id, nickname: row.nickname } : null;
    }),
    findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in
        .map((id) => usersById.get(id))
        .filter((row): row is UserRow => Boolean(row)),
    ),
    findUniqueOrThrow: jest.fn(({ where }: { where: { id: string } }) => {
      const row = usersById.get(where.id);
      if (!row) throw new Error('пользователь не найден в заглушке');
      return row;
    }),
  };

  const db = {
    diceMatch,
    diceMatchPlayer,
    diceMatchAction,
    diceRoll,
    user,
    // `queue()` и `lock()` зовут `$queryRaw` прямо на `tx`, а не только на
    // верхнем `prisma` — тег-функция здесь не разбирает SQL, ей достаточно
    // не падать: настоящий смысл (советная блокировка, `FOR UPDATE`)
    // держит Postgres, а в заглушке эту роль и так играет то, что все
    // операции синхронны и идут по очереди.
    $queryRaw: () => [],
  };
  const prisma = {
    ...db,
    $transaction: (fn: (tx: typeof db) => Promise<unknown>) => fn(db),
  } as unknown as PrismaService;

  return { prisma, matches, players };
}

function service(
  prisma: PrismaService,
  contacts: ContactPolicyService = fakeContacts(),
  notified: Array<{
    toUserId: string;
    fromNickname: string | null;
    matchId: string;
  }> = [],
  declined: Array<{ userId: string; declinedByUserId: string }> = [],
  rewards: Array<{
    userId: string;
    outcome?: 'win' | 'loss' | 'draw';
    xpEarned: number;
    coinsEarned: number;
    ratingDelta?: number;
    cappedWin?: boolean;
  }> = [],
): DiceService {
  const staffNames = {
    nickname: (_id: string, nickname: string | null) => nickname,
    label: (_id: string, nickname: string | null) => nickname,
  } as unknown as StaffNameMask;
  const admins = { roleOf: () => 'PLAYER' } as unknown as AdminRegistry;
  // Уведомление в Telegram — вдогонку и без ожидания (см. `challenge()`):
  // по умолчанию заглушка ничего не роняет, а тест на само уведомление
  // передаёт сюда массив и проверяет, что в него легло.
  const inviteNotifier = {
    notifyDiceChallenge: (params: {
      toUserId: string;
      fromNickname: string | null;
      matchId: string;
    }) => {
      notified.push(params);
      return Promise.resolve();
    },
  } as unknown as InviteNotifierService;
  const notifications = {
    recordDiceDecline: (params: {
      userId: string;
      declinedByUserId: string;
    }) => {
      declined.push(params);
      return Promise.resolve();
    },
  } as unknown as NotificationsService;
  const usersService = {
    applyGameRewards: (
      userId: string,
      params: {
        xpEarned: number;
        coinsEarned: number;
        outcome?: 'win' | 'loss' | 'draw';
        ratingDelta?: number;
        cappedWin?: boolean;
      },
    ) => {
      rewards.push({ userId, ...params });
      return Promise.resolve({});
    },
  } as unknown as UsersService;
  return new DiceService(
    prisma,
    staffNames,
    admins,
    contacts,
    inviteNotifier,
    notifications,
    usersService,
  );
}

function player(id: string, nickname: string): UserRow {
  return {
    id,
    nickname,
    ageBand: null,
    telegramId: BigInt(id.length),
    avatarUrl: null,
    lampFlame: null,
    lampVessel: null,
    lampGlow: null,
  };
}

describe('DiceService — персональные приглашения', () => {
  it('нельзя пригласить самого себя', async () => {
    const { prisma } = fakeDb([player('a', 'Аня')]);
    const dice = service(prisma);
    await expect(dice.challenge('a', 'a', 4000)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('запрет контактов останавливает вызов раньше, чем создаётся стол', async () => {
    const { prisma, matches } = fakeDb([
      player('a', 'Аня'),
      player('b', 'Боря'),
    ]);
    // Собираем вызовы сами, а не через `expect(contacts.assertCanReach)`:
    // метод, оторванный от объекта заглушки типом `ContactPolicyService`,
    // ловится линтером как потенциальная потеря `this` — здесь это ложное
    // срабатывание (`jest.fn` его не использует), но проще обойти, чем
    // спорить с правилом.
    const calls: Array<[string, string]> = [];
    const contacts = fakeContacts((from, to) => {
      calls.push([from, to]);
      return 'Пригласить этого игрока нельзя';
    });
    const dice = service(prisma, contacts);

    await expect(dice.challenge('a', 'b', 4000)).rejects.toThrow(
      ForbiddenException,
    );
    expect(calls).toEqual([['a', 'b']]);
    // Ничего не создалось — отказ должен быть раньше первой записи в базу,
    // а не откатом уже созданной строки.
    expect(matches).toHaveLength(0);
  });

  it('чужого игрока по такому id не существует', async () => {
    const { prisma } = fakeDb([player('a', 'Аня')]);
    const dice = service(prisma);
    await expect(dice.challenge('a', 'ghost', 4000)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('вызов создаёт личный стол — и виден приглашённому', async () => {
    const { prisma } = fakeDb([player('a', 'Аня'), player('b', 'Боря')]);
    const dice = service(prisma);

    const view = await dice.challenge('a', 'b', 4000);
    expect(view.status).toBe('WAITING');

    const pending = await dice.pendingInvites('b');
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      matchId: view.matchId,
      fromUserId: 'a',
      fromNickname: 'Аня',
      targetScore: 4000,
    });
    // У того, кого не звали, приглашений нет.
    expect(await dice.pendingInvites('c' + 'irrelevant')).toEqual([]);
  });

  it('вызов посылает уведомление в Telegram приглашённому, а не себе', async () => {
    const { prisma } = fakeDb([player('a', 'Аня'), player('b', 'Боря')]);
    const notified: Array<{
      toUserId: string;
      fromNickname: string | null;
      matchId: string;
    }> = [];
    const dice = service(prisma, fakeContacts(), notified);

    const view = await dice.challenge('a', 'b', 4000);

    expect(notified).toEqual([
      { toUserId: 'b', fromNickname: 'Аня', matchId: view.matchId },
    ]);
  });

  it('повторный вызов той же пары отклоняется — свой стол уже есть', async () => {
    // Важная тонкость: `challenge()` сначала проверяет, нет ли у самого
    // вызывающего уже активного стола (`active()`, где WAITING тоже
    // считается активным состоянием), и только потом — не приглашал ли он
    // именно этого игрока. Поэтому второй вызов, даже к тому же самому
    // человеку, падает с общим «сначала закончите стол», а не со
    // специальным «вы уже пригласили» — тот текст на практике недостижим,
    // раз первая проверка всегда встаёт раньше. Тест фиксирует то
    // поведение, которое действительно происходит: второй стол не
    // создаётся ни в каком случае.
    const { prisma, matches } = fakeDb([
      player('a', 'Аня'),
      player('b', 'Боря'),
      player('c', 'Вика'),
    ]);
    const dice = service(prisma);

    await dice.challenge('a', 'b', 4000);
    await expect(dice.challenge('a', 'b', 4000)).rejects.toThrow(
      ConflictException,
    );
    await expect(dice.challenge('a', 'c', 4000)).rejects.toThrow(
      ConflictException,
    );
    expect(matches).toHaveLength(1);
  });

  it('посторонний не может сесть за личный стол — ни напрямую, ни по коду', async () => {
    const { prisma } = fakeDb([
      player('a', 'Аня'),
      player('b', 'Боря'),
      player('c', 'Вика'),
    ]);
    const dice = service(prisma);
    const view = await dice.challenge('a', 'b', 4000);

    await expect(dice.join('c', view.matchId)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(dice.byInviteCode('c', view.inviteCode)).rejects.toThrow(
      ForbiddenException,
    );

    // Тот, кого позвали, всё ещё может сесть — блокировка именно по
    // конкретному постороннему, а не по столу целиком.
    const joined = await dice.join('b', view.matchId);
    expect(joined.status).toBe('IN_PROGRESS');
  });

  it('личный вызов тоже ограничен по времени на ход — не только случайный подбор', async () => {
    // Раньше личные столы создавались вовсе без таймера («так играют с
    // друзьями»), и партнёр, который просто не бросает кости, был не
    // ограничен ничем, кроме уборщика брошенных партий (часы, а не
    // секунды) — второй игрок сидел и ждал непонятно чего. Решение
    // владельца: тот же таймер, что и в случайном подборе, для всех
    // столов с живым соперником.
    const { prisma } = fakeDb([player('a', 'Аня'), player('b', 'Боря')]);
    const dice = service(prisma);
    const view = await dice.challenge('a', 'b', 4000);
    expect(view.turnTimeLimit).toBe(60);

    const accepted = await dice.respondToInvite('b', view.matchId, 'ACCEPT');
    expect('turnTimeLimit' in accepted && accepted.turnTimeLimit).toBe(60);
  });

  it('партия с живым соперником начисляет плоскую награду — победителю выигрыш, проигравшему поражение', async () => {
    // До этой правки завершённая партия в кости с человеком не начисляла
    // вообще ничего — ни XP, ни монет, ни рейтинга, ни побед/поражений в
    // статистику, — независимо от исхода. Нашлось живой проверкой: счёт
    // профиля до и после форфейта по таймеру не менялся ни на единицу.
    // Решение владельца — плоская награда, как в дуэли по вопросам.
    const { prisma } = fakeDb([player('a', 'Аня'), player('b', 'Боря')]);
    const rewards: Array<{
      userId: string;
      outcome?: 'win' | 'loss' | 'draw';
      xpEarned: number;
      coinsEarned: number;
      ratingDelta?: number;
      cappedWin?: boolean;
    }> = [];
    const dice = service(prisma, undefined, undefined, undefined, rewards);
    const view = await dice.challenge('a', 'b', 4000);
    await dice.respondToInvite('b', view.matchId, 'ACCEPT');

    await dice.act('b', view.matchId, { type: 'RESIGN' });

    expect(rewards).toContainEqual({
      userId: 'a',
      xpEarned: 40,
      coinsEarned: 15,
      outcome: 'win',
      ratingDelta: 10,
      cappedWin: true,
    });
    expect(rewards).toContainEqual({
      userId: 'b',
      xpEarned: 0,
      coinsEarned: 0,
      outcome: 'loss',
      ratingDelta: -5,
      cappedWin: false,
    });
  });

  it('партия с программой не начисляет награду вообще — свой стимул у неё уже есть', async () => {
    // Программе не с кого спрашивать «капнула ли награда» — очки за неё
    // держит отдельный счётчик побед в `DiceService.progress`, который и
    // открывает следующего соперника. Награда за партию с человеком не
    // должна была случайно распространиться на бота.
    const { prisma } = fakeDb([player('a', 'Аня')]);
    const rewards: Array<{
      userId: string;
      outcome?: 'win' | 'loss' | 'draw';
      xpEarned: number;
      coinsEarned: number;
      ratingDelta?: number;
      cappedWin?: boolean;
    }> = [];
    const dice = service(prisma, undefined, undefined, undefined, rewards);
    const view = await dice.create('a', { botDifficulty: 'EASY' });

    await dice.act('a', view.matchId, { type: 'RESIGN' });

    expect(rewards).toEqual([]);
  });

  it('принятие сажает за стол и убирает приглашение из списка', async () => {
    const { prisma } = fakeDb([player('a', 'Аня'), player('b', 'Боря')]);
    const dice = service(prisma);
    const view = await dice.challenge('a', 'b', 4000);

    const result = await dice.respondToInvite('b', view.matchId, 'ACCEPT');
    expect('matchId' in result && result.status).toBe('IN_PROGRESS');
    expect(await dice.pendingInvites('b')).toEqual([]);
  });

  it('отклонение возвращает {declined: true} и закрывает стол насовсем', async () => {
    const { prisma } = fakeDb([player('a', 'Аня'), player('b', 'Боря')]);
    const declined: Array<{ userId: string; declinedByUserId: string }> = [];
    const dice = service(prisma, undefined, undefined, declined);
    const view = await dice.challenge('a', 'b', 4000);

    const result = await dice.respondToInvite('b', view.matchId, 'DECLINE');
    expect(result).toEqual({ declined: true });
    expect(await dice.pendingInvites('b')).toEqual([]);

    // Отправитель узнаёт об отказе — раньше приглашение просто пропадало
    // у него из вида без единого следа (задача #54 «уведомлять — везде»
    // до «Костей» не дошла).
    expect(declined).toEqual([{ userId: 'a', declinedByUserId: 'b' }]);

    // Стол закрыт по-настоящему: сесть за него после отказа уже нельзя.
    await expect(dice.join('b', view.matchId)).rejects.toThrow(
      BadRequestException,
    );
    // И вызывающий свободен пригласить кого-то снова.
    await expect(dice.challenge('a', 'b', 4000)).resolves.toMatchObject({
      status: 'WAITING',
    });
  });

  it('гонка accept/decline: второй ответ не выдаёт ложный успех', async () => {
    // Это и есть дыра из задачи #1: раньше отклонение было голым
    // `updateMany` без проверки, сколько строк оно на самом деле
    // изменило, — и после уже принятого приглашения снова отвечало
    // `{ declined: true }`, хотя в базе ничего не менялось. Игрок читал
    // «отклонено», а стол на сервере оставался в игре.
    const { prisma } = fakeDb([player('a', 'Аня'), player('b', 'Боря')]);
    const dice = service(prisma);
    const view = await dice.challenge('a', 'b', 4000);

    await dice.respondToInvite('b', view.matchId, 'ACCEPT');
    await expect(
      dice.respondToInvite('b', view.matchId, 'DECLINE'),
    ).rejects.toThrow(NotFoundException);

    // Стол остался в игре — повторный (устаревший) отказ его не тронул.
    const stillThere = await dice.view(view.matchId, 'a');
    expect(stillThere.status).toBe('IN_PROGRESS');
  });

  it('повторный отказ после уже случившегося отказа тоже не выдаёт успех', async () => {
    const { prisma } = fakeDb([player('a', 'Аня'), player('b', 'Боря')]);
    const dice = service(prisma);
    const view = await dice.challenge('a', 'b', 4000);

    await dice.respondToInvite('b', view.matchId, 'DECLINE');
    await expect(
      dice.respondToInvite('b', view.matchId, 'DECLINE'),
    ).rejects.toThrow(NotFoundException);
  });
});
