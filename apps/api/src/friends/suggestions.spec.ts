import { FriendsService } from './friends.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ContactPolicyService } from '../contact/contact-policy.service';
import type { PresenceService } from '../presence/presence.service';
import type { TelegramBotService } from '../notifications/telegram-bot.service';

/**
 * Тест сторожит **кого нельзя предлагать**, а не то, как считается порядок.
 *
 * Подсказка — единственное место, где приложение само показывает человеку
 * незнакомые имена. Отсюда две вещи, которые ломаются одной строкой и не
 * видны по коду:
 *
 * 1. Детский аккаунт не должен всплывать у незнакомых. В поиске он защищён
 *    точным совпадением ника; если убрать фильтр здесь, защита обходится
 *    через другую дверь — и обход выглядит как обычный список.
 * 2. Друзья, висящие заявки и обе стороны чёрного списка не предлагаются.
 *    Пропажу фильтра видно только на аккаунте с историей: у нового игрока
 *    список одинаков и с фильтром, и без него.
 *
 * Поэтому проверяем не выдачу (её собрал бы мок), а условия, с которыми
 * уходит запрос: они и есть правило. Аргументы ловим на месте, а не через
 * `mock.calls`, — там они приходят нетипизированными, и до `where`
 * добраться уже нечем.
 */
describe('FriendsService.getSuggestions', () => {
  interface FriendshipWhere {
    userId?: string | { in: string[] };
    friendId?: { notIn: string[] };
  }
  interface ParticipantWhere {
    userId?: string | { notIn: string[] };
  }
  interface UserWhere {
    id?: { in: string[] };
    nickname?: { not: null };
    OR?: unknown[];
  }

  function serviceWith(options: {
    myFriends?: string[];
    pending?: { fromUserId: string; toUserId: string }[];
    bans?: { leaderId: string; bannedUserId: string }[];
    mySessions?: string[];
    coPlayers?: string[];
    secondCircle?: string[];
    users?: { id: string; nickname: string; rating: number }[];
  }) {
    const myFriends = options.myFriends ?? [];
    const captured: {
      secondCircleWhere?: FriendshipWhere;
      coPlayersWhere?: ParticipantWhere;
      userWhere?: UserWhere;
    } = {};

    // Оба круга дружбы читаются одним и тем же `friendship.findMany`, и
    // различить их можно только по форме `where.userId`: строка — «мои
    // друзья», `{ in: [...] }` — «друзья моих друзей».
    const friendshipFindMany = jest.fn((args: { where: FriendshipWhere }) => {
      if (typeof args.where.userId === 'string') {
        return Promise.resolve(myFriends.map((friendId) => ({ friendId })));
      }
      captured.secondCircleWhere = args.where;
      return Promise.resolve(
        (options.secondCircle ?? []).map((friendId) => ({ friendId })),
      );
    });

    // Первый вызов — «в каких партиях я был», второй — «кто там был кроме
    // меня». Различаем по счётчику, а не по форме `where`: опора на форму
    // ломала бы тест при любой правке фильтров.
    let participantCalls = 0;
    const participantFindMany = jest.fn((args: { where: ParticipantWhere }) => {
      participantCalls += 1;
      if (participantCalls === 1) {
        return Promise.resolve(
          (options.mySessions ?? []).map((sessionId) => ({ sessionId })),
        );
      }
      captured.coPlayersWhere = args.where;
      return Promise.resolve(
        (options.coPlayers ?? []).map((userId) => ({ userId })),
      );
    });

    const userFindMany = jest.fn((args: { where: UserWhere }) => {
      captured.userWhere = args.where;
      return Promise.resolve(
        (options.users ?? []).map((u) => ({ avatarUrl: null, level: 1, ...u })),
      );
    });

    const prisma = {
      friendship: { findMany: friendshipFindMany },
      friendRequest: {
        findMany: jest.fn(() => Promise.resolve(options.pending ?? [])),
      },
      roomBan: { findMany: jest.fn(() => Promise.resolve(options.bans ?? [])) },
      gameParticipant: { findMany: participantFindMany },
      user: { findMany: userFindMany },
    } as unknown as PrismaService;

    const presence = {
      areOnline: jest.fn(() => Promise.resolve({})),
    } as unknown as PresenceService;

    const service = new FriendsService(
      prisma,
      presence,
      {} as TelegramBotService,
      {} as ContactPolicyService,
    );
    return { service, captured };
  }

  it('не предлагает детские аккаунты', async () => {
    const { service, captured } = serviceWith({
      mySessions: ['s1'],
      coPlayers: ['stranger'],
      users: [{ id: 'stranger', nickname: 'Незнакомец', rating: 100 }],
    });

    await service.getSuggestions('me');

    expect(captured.userWhere?.OR).toEqual([
      { ageBand: null },
      { ageBand: { not: 'CHILD' } },
    ]);
  });

  it('не предлагает тех, кто не дошёл до никнейма', async () => {
    const { service, captured } = serviceWith({
      mySessions: ['s1'],
      coPlayers: ['half-registered'],
    });

    await service.getSuggestions('me');

    expect(captured.userWhere?.nickname).toEqual({ not: null });
  });

  it('не предлагает друзей, заявки и чёрный список', async () => {
    const { service, captured } = serviceWith({
      myFriends: ['friend'],
      pending: [{ fromUserId: 'me', toUserId: 'asked' }],
      bans: [{ leaderId: 'me', bannedUserId: 'banned' }],
      mySessions: ['s1'],
    });

    await service.getSuggestions('me');

    const coPlayers = captured.coPlayersWhere?.userId;
    const secondCircle = captured.secondCircleWhere?.friendId;
    for (const excluded of ['me', 'friend', 'asked', 'banned']) {
      expect(typeof coPlayers === 'object' ? coPlayers.notIn : []).toContain(
        excluded,
      );
      expect(secondCircle?.notIn).toContain(excluded);
    }
  });

  it('«играли вместе» показывает выше общих друзей', async () => {
    const { service } = serviceWith({
      myFriends: ['friend'],
      mySessions: ['s1'],
      coPlayers: ['played-with'],
      secondCircle: ['friend-of-friend'],
      users: [
        // Порядок из базы намеренно обратный ожидаемому: сортировка наша,
        // а не удачное совпадение с порядком строк.
        { id: 'friend-of-friend', nickname: 'Второй круг', rating: 900 },
        { id: 'played-with', nickname: 'Соперник', rating: 100 },
      ],
    });

    const result = await service.getSuggestions('me');

    expect(result.map((r) => r.userId)).toEqual([
      'played-with',
      'friend-of-friend',
    ]);
    expect(result[0]).toMatchObject({ reason: 'played', count: 1 });
    expect(result[1]).toMatchObject({ reason: 'mutual', count: 1 });
  });

  it('показывает не больше десяти', async () => {
    const many = Array.from({ length: 25 }, (_, i) => `user${i}`);
    const { service } = serviceWith({
      myFriends: ['friend'],
      secondCircle: many,
      users: many.map((id, i) => ({ id, nickname: id, rating: i })),
    });

    const result = await service.getSuggestions('me');

    expect(result).toHaveLength(10);
    // Первым — самый сильный: у равных оснований порядок решает рейтинг.
    expect(result[0].userId).toBe('user24');
  });
});
