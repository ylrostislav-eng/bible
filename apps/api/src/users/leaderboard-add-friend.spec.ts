import type { LeaderboardEntry } from '@bible-arena/shared';
import type { AdminRegistry } from '../auth/admin-registry.service';
import type { StaffNameMask } from '../auth/staff-name-mask.service';
import { UsersService } from './users.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';

/**
 * Тест сторожит, **кому в рейтинге не показывается кнопка «Добавить»**.
 *
 * Список лидеров — единственное место, где видно много незнакомых людей
 * сразу. Кнопка рядом с каждой строкой превращает его в готовый перечень
 * тех, кого можно позвать одним касанием, поэтому важнее всего строка про
 * детей: у них защита держится на том, что найти их можно только по
 * точному нику, а список лидеров показывает ник сам.
 *
 * Остальные четыре причины скучнее, но ломаются так же тихо: кнопка у
 * своей строки, у друга, у висящей заявки и у чёрного списка приводит к
 * отказу сервера уже после нажатия — то есть выглядит как «кнопка не
 * работает».
 */
describe('UsersService.getLeaderboard — кнопка «Добавить в друзья»', () => {
  const ME = 'me';

  /** `telegramId` здесь не для красоты: строка рейтинга спрашивает по нему
   * роль (значок гейм-мастера или админа вместо титула), и без него сборка
   * строки падает. */
  let nextTelegramId = 1000n;

  function user(id: string, rating: number) {
    return {
      id,
      telegramId: nextTelegramId++,
      nickname: id,
      avatarUrl: null,
      country: null,
      level: 1,
      rating,
      gamesWon: 0,
      gamesLost: 0,
      createdAt: new Date('2026-01-01'),
    };
  }

  function serviceWith(options: {
    people: string[];
    friends?: string[];
    pending?: { fromUserId: string; toUserId: string }[];
    bans?: { leaderId: string; bannedUserId: string }[];
    children?: string[];
  }) {
    const rows = [ME, ...options.people].map((id, i) => user(id, 1000 - i));
    const prisma = {
      user: {
        findMany: jest.fn((args: { where?: { ageBand?: string } }) =>
          Promise.resolve(
            args.where?.ageBand === 'CHILD'
              ? (options.children ?? []).map((id) => ({ id }))
              : rows,
          ),
        ),
      },
      friendship: {
        findMany: jest.fn(() =>
          Promise.resolve(
            (options.friends ?? []).map((friendId) => ({ friendId })),
          ),
        ),
      },
      friendRequest: {
        findMany: jest.fn(() => Promise.resolve(options.pending ?? [])),
      },
      roomBan: { findMany: jest.fn(() => Promise.resolve(options.bans ?? [])) },
    } as unknown as PrismaService;

    // Redis рейтингу не нужен: он читает только базу. Реестр админов —
    // нужен: строка рейтинга несёт значок, и без него сборка строки падает.
    return new UsersService(
      prisma,
      {} as RedisService,
      {
        roleOf: () => 'PLAYER' as const,
      } as unknown as AdminRegistry,
      // Никто не скрывал имя — маска пропускает всё насквозь.
      {
        nickname: (_id: string, nickname: string | null) => nickname,
      } as unknown as StaffNameMask,
    );
  }

  async function canAdd(
    service: UsersService,
  ): Promise<Record<string, boolean>> {
    const { entries } = await service.getLeaderboard(ME);
    return Object.fromEntries(
      entries.map((e: LeaderboardEntry) => [e.id, e.canAddFriend]),
    );
  }

  it('не показывает кнопку у детских аккаунтов', async () => {
    const service = serviceWith({
      people: ['adult', 'kid'],
      children: ['kid'],
    });

    const result = await canAdd(service);

    expect(result.kid).toBe(false);
    expect(result.adult).toBe(true);
  });

  it('не показывает кнопку у себя, друзей, заявок и чёрного списка', async () => {
    const service = serviceWith({
      people: [
        'friend',
        'asked',
        'asked-me',
        'banned',
        'banned-me',
        'stranger',
      ],
      friends: ['friend'],
      pending: [
        { fromUserId: ME, toUserId: 'asked' },
        { fromUserId: 'asked-me', toUserId: ME },
      ],
      bans: [
        { leaderId: ME, bannedUserId: 'banned' },
        { leaderId: 'banned-me', bannedUserId: ME },
      ],
    });

    const result = await canAdd(service);

    expect(result[ME]).toBe(false);
    expect(result.friend).toBe(false);
    expect(result.asked).toBe(false);
    expect(result['asked-me']).toBe(false);
    expect(result.banned).toBe(false);
    expect(result['banned-me']).toBe(false);
    // Незнакомец — единственный, кого можно позвать.
    expect(result.stranger).toBe(true);
  });
});
