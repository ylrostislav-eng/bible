import { ForbiddenException } from '@nestjs/common';
import { ContactPolicyService } from './contact-policy.service';
import type { ModerationService } from '../moderation/moderation.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Правило «кто может дотянуться до кого» собрано в один сервис из трёх
 * разошедшихся наборов проверок. Здесь проверяется то, ради чего его и
 * собирали:
 *
 * 1. **Чёрный список работает в обе стороны.** У вызова на дуэль и у
 *    приглашения в комнату он смотрел только одну — «меня заблокировали», —
 *    и заблокировавший продолжал получать приглашения от того, кого сам
 *    закрыл.
 * 2. **Ребёнка может позвать только тот, кого он добавил сам.** Пока
 *    требовалась дружба, опорой была взаимность. Когда вызывать стало
 *    можно любого, эта опора исчезла бы вместе с требованием — и любой
 *    взрослый смог бы звать ребёнка в игру.
 * 3. **Ограничение по жалобам спрашивается первым** — оно про самого
 *    зовущего и не должно зависеть от того, кого он зовёт.
 */
describe('ContactPolicyService', () => {
  interface Stubs {
    ban?: { id: string } | null;
    targetAgeBand?: string | null;
    childAdded?: boolean;
    muted?: boolean;
  }

  function serviceWith({
    ban = null,
    targetAgeBand = 'ADULT',
    childAdded = false,
    muted = false,
  }: Stubs) {
    const calls = {
      banWhere: undefined as unknown,
      friendshipWhere: undefined as unknown,
    };
    // Ссылка на сам `jest.fn`, а не обращение к `prisma.roomBan.findFirst`
    // в проверке: у метода, оторванного от объекта, линтер справедливо
    // ругается на потерянный `this`.
    const banFindFirst = jest.fn((args: { where: unknown }) => {
      calls.banWhere = args.where;
      return Promise.resolve(ban);
    });
    const prisma = {
      roomBan: { findFirst: banFindFirst },
      user: {
        findUnique: jest.fn().mockResolvedValue({ ageBand: targetAgeBand }),
      },
      friendship: {
        findUnique: jest.fn((args: { where: unknown }) => {
          calls.friendshipWhere = args.where;
          return Promise.resolve(childAdded ? { userId: 'ребёнок' } : null);
        }),
      },
    } as unknown as PrismaService;

    const moderation = {
      assertNotMuted: jest.fn(() =>
        muted
          ? Promise.reject(new ForbiddenException('ограничен'))
          : Promise.resolve(),
      ),
    } as unknown as ModerationService;

    return {
      service: new ContactPolicyService(prisma, moderation),
      calls,
      banFindFirst,
    };
  }

  describe('assertCanReach', () => {
    it('пропускает обычного взрослого', async () => {
      const { service } = serviceWith({});
      await expect(service.assertCanReach('я', 'он')).resolves.toBeUndefined();
    });

    it('смотрит чёрный список в обе стороны', async () => {
      const { service, calls } = serviceWith({});
      await service.assertCanReach('я', 'он');
      expect(calls.banWhere).toEqual({
        OR: [
          { leaderId: 'я', bannedUserId: 'он' },
          { leaderId: 'он', bannedUserId: 'я' },
        ],
      });
    });

    it('отказывает при блокировке', async () => {
      const { service } = serviceWith({ ban: { id: 'бан' } });
      await expect(service.assertCanReach('я', 'он')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('не пускает к ребёнку, который не добавлял', async () => {
      const { service } = serviceWith({ targetAgeBand: 'CHILD' });
      await expect(
        service.assertCanReach('взрослый', 'ребёнок'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('пускает к ребёнку, который добавил сам — и смотрит именно его сторону', async () => {
      const { service, calls } = serviceWith({
        targetAgeBand: 'CHILD',
        childAdded: true,
      });

      await expect(
        service.assertCanReach('взрослый', 'ребёнок'),
      ).resolves.toBeUndefined();

      // Важно направление: запись ищется от ребёнка к взрослому. Обратная
      // означала бы «взрослый добавил ребёнка» — то есть согласие того, кого
      // и надо защитить, ни при чём.
      expect(calls.friendshipWhere).toEqual({
        userId_friendId: { userId: 'ребёнок', friendId: 'взрослый' },
      });
    });

    it('ограниченного по жалобам не пускает и до базы не доходит', async () => {
      const { service, banFindFirst } = serviceWith({ muted: true });

      await expect(service.assertCanReach('я', 'он')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(banFindFirst).not.toHaveBeenCalled();
    });
  });

  describe('reachableAmong', () => {
    /** Списочная проверка идёт другим путём — двумя запросами вместо
     * поштучных, — поэтому её правила проверяются отдельно: разойтись с
     * `assertCanReach` они могут молча. */
    function listService(
      bans: { leaderId: string; bannedUserId: string }[],
      childrenWhoAdded: string[],
    ) {
      const prisma = {
        roomBan: { findMany: jest.fn().mockResolvedValue(bans) },
        friendship: {
          findMany: jest
            .fn()
            .mockResolvedValue(childrenWhoAdded.map((userId) => ({ userId }))),
        },
      } as unknown as PrismaService;
      return new ContactPolicyService(prisma, {} as ModerationService);
    }

    it('убирает заблокированных в обе стороны', async () => {
      const service = listService(
        [
          { leaderId: 'я', bannedUserId: 'мной-забанен' },
          { leaderId: 'меня-забанил', bannedUserId: 'я' },
        ],
        [],
      );

      const reachable = await service.reachableAmong('я', [
        { id: 'мной-забанен', ageBand: 'ADULT' },
        { id: 'меня-забанил', ageBand: 'ADULT' },
        { id: 'обычный', ageBand: 'ADULT' },
      ]);

      expect([...reachable]).toEqual(['обычный']);
    });

    it('оставляет только тех детей, которые добавили сами', async () => {
      const service = listService([], ['свой-ребёнок']);

      const reachable = await service.reachableAmong('я', [
        { id: 'свой-ребёнок', ageBand: 'CHILD' },
        { id: 'чужой-ребёнок', ageBand: 'CHILD' },
        { id: 'взрослый', ageBand: null },
      ]);

      expect([...reachable].sort()).toEqual(['взрослый', 'свой-ребёнок']);
    });
  });
});
