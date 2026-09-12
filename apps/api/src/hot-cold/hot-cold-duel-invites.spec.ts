import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ContactPolicyService } from '../contact/contact-policy.service';
import type { InviteNotifierService } from '../notifications/invite-notifier.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PresenceService } from '../presence/presence.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SemanticsService } from '../semantics/semantics.service';
import type { StaffNameMask } from '../auth/staff-name-mask.service';
import type { UsersService } from '../users/users.service';
import { HotColdDuelService } from './hot-cold-duel.service';

/**
 * Личные приглашения в дуэль «горячо-холодно» — та же механика, что у
 * дуэли по вопросам и у «Костей»: атомарный ответ, контактная политика,
 * уведомление отправителю при отказе. `targetUserId` на `HotColdDuel`
 * существовал с самого начала режима, но интерфейс им никогда не
 * пользовался — только код вручную. Этот набор проверяет ровно то, что
 * добавилось: контактную политику при вызове, повторный вызов той же паре,
 * список ожидающих приглашений, принятие, отклонение и гонку accept/decline.
 *
 * Заглушка БД покрывает только то, что нужно этим путям (`create`,
 * `pendingInvites`, `respondToInvite`, `cancel`, `joinDuel` изнутри
 * `respondToInvite`), а не весь движок партии — тот же приём, что и в
 * `dice-invites.spec.ts`.
 */

interface DuelRow {
  id: string;
  inviteCode: string;
  targetUserId: string | null;
  openToMatchmaking: boolean;
  wordId: string;
  status: 'WAITING' | 'READY_CHECK' | 'IN_PROGRESS' | 'FINISHED' | 'ABANDONED';
  winnerId: string | null;
  createdAt: Date;
  finishedAt: Date | null;
}

interface PlayerRow {
  id: string;
  duelId: string;
  userId: string;
}

interface UserRow {
  id: string;
  nickname: string | null;
  ageBand: string | null;
}

function fakeContacts(deny?: (from: string, to: string) => string | null) {
  return {
    assertCanReach: (from: string, to: string) => {
      const reason = deny?.(from, to);
      if (reason) throw new ForbiddenException(reason);
      return Promise.resolve();
    },
  } as unknown as ContactPolicyService;
}

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}${++idCounter}`;

function fakeDb(users: UserRow[]) {
  const duels: DuelRow[] = [];
  const players: PlayerRow[] = [];
  const usersById = new Map(users.map((u) => [u.id, u]));

  function withPlayers(duel: DuelRow) {
    return {
      ...duel,
      players: players
        .filter((p) => p.duelId === duel.id)
        .map((p) => ({ ...p, user: usersById.get(p.userId) ?? null })),
    };
  }

  function duelsWhere(where: Record<string, unknown>): DuelRow[] {
    return duels.filter((d) => {
      if (where.id !== undefined && d.id !== where.id) return false;
      if (where.status !== undefined) {
        const status = where.status as string | { in?: string[] };
        if (typeof status === 'string') {
          if (d.status !== status) return false;
        } else if (status?.in && !status.in.includes(d.status)) return false;
      }
      if (
        where.targetUserId !== undefined &&
        d.targetUserId !== where.targetUserId
      )
        return false;
      const playersFilter = where.players as
        { some?: { userId: string } } | undefined;
      if (playersFilter?.some) {
        const has = players.some(
          (p) => p.duelId === d.id && p.userId === playersFilter.some!.userId,
        );
        if (!has) return false;
      }
      return true;
    });
  }

  const hotColdDuel = {
    findFirst: jest.fn(
      ({
        where,
        orderBy,
      }: {
        where: Record<string, unknown>;
        orderBy?: { createdAt?: 'asc' | 'desc' };
      }) => {
        const found = duelsWhere(where);
        if (orderBy?.createdAt === 'desc') {
          found.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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
        const found = duelsWhere(where).map(withPlayers);
        if (orderBy?.createdAt === 'desc') {
          found.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        return found;
      },
    ),
    findUnique: jest.fn(({ where }: { where: Record<string, unknown> }) => {
      const found = duelsWhere(where)[0];
      return found ? withPlayers(found) : null;
    }),
    create: jest.fn(
      ({
        data,
      }: {
        data: Record<string, unknown> & {
          players?: { create?: { userId: string } };
        };
      }) => {
        const { players: playersInput, ...rest } = data;
        const duel: DuelRow = {
          id: nextId('duel'),
          inviteCode: rest.inviteCode as string,
          targetUserId: (rest.targetUserId as string | null) ?? null,
          openToMatchmaking: (rest.openToMatchmaking as boolean) ?? false,
          wordId: rest.wordId as string,
          status: 'WAITING',
          winnerId: null,
          createdAt: new Date(),
          finishedAt: null,
        };
        duels.push(duel);
        if (playersInput?.create) {
          players.push({
            id: nextId('player'),
            duelId: duel.id,
            userId: playersInput.create.userId,
          });
        }
        return withPlayers(duel);
      },
    ),
    updateMany: jest.fn(
      ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const found = duelsWhere(where);
        for (const duel of found) {
          Object.assign(duel, data);
        }
        return { count: found.length };
      },
    ),
  };

  const hotColdDuelPlayer = {
    create: jest.fn(
      ({ data }: { data: { duelId: string; userId: string } }) => {
        const player: PlayerRow = { id: nextId('player'), ...data };
        players.push(player);
        return player;
      },
    ),
  };

  const findUser = ({ where }: { where: { id: string } }) => {
    const row = usersById.get(where.id);
    return row
      ? { id: row.id, nickname: row.nickname, ageBand: row.ageBand }
      : null;
  };
  const user = {
    findUnique: jest.fn(findUser),
    findUniqueOrThrow: jest.fn((args: { where: { id: string } }) => {
      const found = findUser(args);
      if (!found) throw new NotFoundException('Пользователь не найден');
      return found;
    }),
  };

  const aliasWord = {
    findMany: jest.fn(() => [
      {
        id: 'word1',
        word: 'вера',
        gloss: 'доверие Богу',
        category: 'ABSTRACT',
      },
    ]),
  };

  const hotColdAttempt = {
    findMany: jest.fn(() => []),
  };

  const roomBan = {
    findMany: jest.fn(() => []),
  };

  const prisma = {
    hotColdDuel,
    hotColdDuelPlayer,
    user,
    aliasWord,
    hotColdAttempt,
    roomBan,
  } as unknown as PrismaService;

  return { prisma, duels, players };
}

function fakeSemantics(): SemanticsService {
  return {
    ready: true,
    lookup: () => 0,
    episodesFor: () => 999,
  } as unknown as SemanticsService;
}

function service(
  prisma: PrismaService,
  contacts: ContactPolicyService = fakeContacts(),
  declined: Array<{ userId: string; declinedByUserId: string }> = [],
  challenged: Array<{
    toUserId: string;
    fromNickname: string | null;
    duelId: string;
  }> = [],
): HotColdDuelService {
  const staffNames = {
    label: (_id: string, nickname: string | null) => nickname,
  } as unknown as StaffNameMask;
  const notifications = {
    recordHotColdDecline: (params: {
      userId: string;
      declinedByUserId: string;
    }) => {
      declined.push(params);
      return Promise.resolve();
    },
  } as unknown as NotificationsService;
  const inviteNotifier = {
    notifyHotColdChallenge: (params: {
      toUserId: string;
      fromNickname: string | null;
      duelId: string;
    }) => {
      challenged.push(params);
      return Promise.resolve();
    },
  } as unknown as InviteNotifierService;
  return new HotColdDuelService(
    prisma,
    {} as unknown as UsersService,
    fakeSemantics(),
    staffNames,
    {} as unknown as PresenceService,
    contacts,
    notifications,
    inviteNotifier,
  );
}

function player(
  id: string,
  nickname: string,
  ageBand: string | null = null,
): UserRow {
  return { id, nickname, ageBand };
}

describe('личные приглашения в «Горячо-холодно»', () => {
  it('нельзя вызвать самого себя', async () => {
    const { prisma } = fakeDb([player('a', 'Аня')]);
    const duels = service(prisma);
    await expect(duels.create('a', 'a')).rejects.toThrow(BadRequestException);
  });

  it('контактная политика проверяется при личном вызове', async () => {
    const { prisma } = fakeDb([player('a', 'Аня'), player('b', 'Боря')]);
    const contacts = fakeContacts(
      () => 'Этот игрок недоступен для приглашений',
    );
    const duels = service(prisma, contacts);
    await expect(duels.create('a', 'b')).rejects.toThrow('недоступен');
  });

  it('повторный вызов той же паре, пока не отвечено, отклоняется', async () => {
    // Специальная проверка «уже пригласили этого» на практике недостижима
    // раньше общей «уже есть незаконченная дуэль»: свой же WAITING-вызов
    // считается активным столом (`activeFor`), и вторая попытка `create`
    // падает на первой проверке. Тот же дохлый код уже задокументирован у
    // «Костей» (`docs/dice.md`) — тут для симметрии оставлена та же пара
    // проверок, а этот тест фиксирует ровно то, что происходит на самом
    // деле, а не то, что предполагалось написанием второй проверки.
    const { prisma } = fakeDb([player('a', 'Аня'), player('b', 'Боря')]);
    const duels = service(prisma);
    await duels.create('a', 'b');
    await expect(duels.create('a', 'b')).rejects.toThrow(
      'У вас уже есть незаконченная дуэль',
    );
  });

  it('вызов создаёт запись, видную получателю в pendingInvites, и шлёт нотификацию', async () => {
    const { prisma } = fakeDb([player('a', 'Аня'), player('b', 'Боря')]);
    const challenged: Array<{
      toUserId: string;
      fromNickname: string | null;
      duelId: string;
    }> = [];
    const duels = service(prisma, undefined, undefined, challenged);
    const duelId = await duels.create('a', 'b');

    const pending = await duels.pendingInvites('b');
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      duelId,
      fromUserId: 'a',
      fromNickname: 'Аня',
    });
    expect(await duels.pendingInvites('a')).toEqual([]);
    expect(challenged).toEqual([
      { toUserId: 'b', fromNickname: 'Аня', duelId },
    ]);
  });

  it('чужой не может ответить на вызов, адресованный другому', async () => {
    const { prisma } = fakeDb([
      player('a', 'Аня'),
      player('b', 'Боря'),
      player('c', 'Вика'),
    ]);
    const duels = service(prisma);
    const duelId = await duels.create('a', 'b');
    await expect(duels.respondToInvite('c', duelId, 'ACCEPT')).rejects.toThrow(
      'адресован другому игроку',
    );
    await expect(duels.respondToInvite('c', duelId, 'DECLINE')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('принятие сажает за стол и убирает из pendingInvites', async () => {
    const { prisma } = fakeDb([player('a', 'Аня'), player('b', 'Боря')]);
    const duels = service(prisma);
    const duelId = await duels.create('a', 'b');

    const result = await duels.respondToInvite('b', duelId, 'ACCEPT');
    expect(result).toEqual({ duelId });
    expect(await duels.pendingInvites('b')).toEqual([]);
    // `READY_CHECK` — тоже активный стол: раньше `activeFor` его не
    // признавал, и принявший приглашение не с самого экрана «Горячо-
    // холодно» попадал не за стол, а обратно в лобби (см. `activeFor`).
    expect(await duels.activeFor('b')).toBe(duelId);
  });

  it('отклонение возвращает {declined: true}, закрывает стол насовсем и уведомляет отправителя', async () => {
    const { prisma } = fakeDb([player('a', 'Аня'), player('b', 'Боря')]);
    const declined: Array<{ userId: string; declinedByUserId: string }> = [];
    const duels = service(prisma, undefined, declined);
    const duelId = await duels.create('a', 'b');

    const result = await duels.respondToInvite('b', duelId, 'DECLINE');
    expect(result).toEqual({ declined: true });
    expect(await duels.pendingInvites('b')).toEqual([]);
    expect(declined).toEqual([{ userId: 'a', declinedByUserId: 'b' }]);

    // Стол закрыт по-настоящему: повторный ответ уже не находит приглашение.
    await expect(
      duels.respondToInvite('b', duelId, 'ACCEPT'),
    ).rejects.toThrow();
    // И отправитель свободен позвать снова.
    await expect(duels.create('a', 'b')).resolves.toEqual(expect.any(String));
  });

  it('гонка accept/decline: повторный decline после accept не отбирает партию назад', async () => {
    const { prisma } = fakeDb([player('a', 'Аня'), player('b', 'Боря')]);
    const duels = service(prisma);
    const duelId = await duels.create('a', 'b');

    await duels.respondToInvite('b', duelId, 'ACCEPT');
    await expect(duels.respondToInvite('b', duelId, 'DECLINE')).rejects.toThrow(
      NotFoundException,
    );
    expect(await duels.activeFor('b')).toBe(duelId);
  });

  it('отправитель может отменить свой неотвеченный вызов', async () => {
    const { prisma } = fakeDb([player('a', 'Аня'), player('b', 'Боря')]);
    const duels = service(prisma);
    const duelId = await duels.create('a', 'b');

    await duels.cancel('a', duelId);
    await expect(
      duels.respondToInvite('b', duelId, 'ACCEPT'),
    ).rejects.toThrow();
    await expect(duels.create('a', 'b')).resolves.toEqual(expect.any(String));
  });

  it('отменить чужой вызов нельзя', async () => {
    const { prisma } = fakeDb([player('a', 'Аня'), player('b', 'Боря')]);
    const duels = service(prisma);
    const duelId = await duels.create('a', 'b');
    await expect(duels.cancel('b', duelId)).rejects.toThrow(NotFoundException);
  });

  it('отменить уже принятый вызов нельзя', async () => {
    const { prisma } = fakeDb([player('a', 'Аня'), player('b', 'Боря')]);
    const duels = service(prisma);
    const duelId = await duels.create('a', 'b');
    await duels.respondToInvite('b', duelId, 'ACCEPT');
    await expect(duels.cancel('a', duelId)).rejects.toThrow('уже сел за стол');
  });
});

/**
 * Детский режим и публичный поиск.
 *
 * До этого аудита `findOpponent`/`joinDuel` не спрашивали ни `ageBand`, ни
 * `ContactPolicyService` вовсе — единственной защитой был взаимный бан.
 * У «Костей» ровно этот путь закрыт в три слоя (`assertPublicSearch` на
 * входе в подбор, та же проверка внутри `create` с `openToMatchmaking`, и
 * двусторонний `assertCanReach` в точке, где садится второй игрок); здесь
 * не было ни одного. Ребёнок мог оказаться в партии со случайным
 * взрослым — через подбор или просто через код, который куда-то
 * пересылают.
 */
describe('«Горячо-холодно»: детский режим и публичный поиск', () => {
  it('ребёнок не может открыть публичный поиск', async () => {
    const { prisma } = fakeDb([player('a', 'Аня', 'CHILD')]);
    const duels = service(prisma);
    await expect(duels.create('a', undefined, true)).rejects.toThrow(
      'детском режиме',
    );
  });

  it('«найти соперника» недоступно ребёнку', async () => {
    const { prisma } = fakeDb([player('a', 'Аня', 'CHILD')]);
    const duels = service(prisma);
    await expect(duels.findOpponent('a')).rejects.toThrow('детском режиме');
  });

  it('счётчик ожидающих соперников для ребёнка всегда ноль', async () => {
    const { prisma } = fakeDb([player('a', 'Аня', 'CHILD')]);
    const duels = service(prisma);
    await expect(duels.waitingOpponents('a')).resolves.toEqual({ total: 0 });
  });

  it('вход по коду проверяет контактную политику против хозяина стола', async () => {
    const { prisma, duels: rows } = fakeDb([
      player('a', 'Аня'),
      player('b', 'Боря'),
    ]);
    const hostDuelId = await service(prisma).create('a');
    const code = rows.find((d) => d.id === hostDuelId)!.inviteCode;

    const contacts = fakeContacts((from, to) =>
      from === 'b' && to === 'a' ? 'Этот игрок недоступен' : null,
    );
    await expect(
      service(prisma, contacts).joinByCode('b', code),
    ).rejects.toThrow('недоступен');
  });

  it('вход по коду проверяет контактную политику и со стороны хозяина', async () => {
    // Тот же вход, но запрет смотрит с другой стороны: без второго вызова
    // `assertCanReach` в `joinDuel` это прошло бы — только первое
    // направление и проверялось бы.
    const { prisma, duels: rows } = fakeDb([
      player('a', 'Аня'),
      player('b', 'Боря'),
    ]);
    const hostDuelId = await service(prisma).create('a');
    const code = rows.find((d) => d.id === hostDuelId)!.inviteCode;

    const contacts = fakeContacts((from, to) =>
      from === 'a' && to === 'b' ? 'Этот игрок недоступен' : null,
    );
    await expect(
      service(prisma, contacts).joinByCode('b', code),
    ).rejects.toThrow('недоступен');
  });

  it('вход по коду по-прежнему работает, когда контактная политика не против', async () => {
    const { prisma, duels: rows } = fakeDb([
      player('a', 'Аня'),
      player('b', 'Боря'),
    ]);
    const hostDuelId = await service(prisma).create('a');
    const code = rows.find((d) => d.id === hostDuelId)!.inviteCode;

    const duelId = await service(prisma).joinByCode('b', code);
    expect(duelId).toBe(hostDuelId);
  });
});
