import { ForbiddenException } from '@nestjs/common';
import { FriendsService } from './friends.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PresenceService } from '../presence/presence.service';
import type { TelegramBotService } from '../notifications/telegram-bot.service';

/**
 * Две дыры, найденные аудитом безопасности. Обе про одно и то же: интерфейс
 * прятал действие, а сервер его разрешал.
 *
 * ## Приглашение по ссылке
 *
 * В ссылке стоял `id` пользователя, а параметр запуска приходит от клиента
 * и ничем не подписан. Для **нового** аккаунта приглашение создаёт не
 * заявку, а сразу взаимную дружбу — и это правильно, пока ссылку раздаёт
 * сам владелец. Но `id` любого игрока виден в списке лидеров, поэтому
 * достаточно было завести свежий аккаунт и открыть приложение с `ref_<чужой
 * id>`, чтобы стать другом кого угодно без его ведома. Дружба открывает
 * личный чат — единственную преграду между взрослым и чужим ребёнком.
 *
 * ## Заявка в обход чёрного списка
 *
 * Кнопку интерфейс прятал, но запрос к `/friends/requests` отправляется и
 * без интерфейса, а заявка приходит уведомлением.
 */
describe('FriendsService — защита от подделки приглашения и обхода блокировки', () => {
  function serviceWith(prisma: Partial<PrismaService>) {
    return new FriendsService(
      prisma as PrismaService,
      {} as PresenceService,
      {} as TelegramBotService,
    );
  }

  describe('linkFromInvite', () => {
    it('не создаёт дружбу по подделанному токену', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const upsert = jest.fn();
      const service = serviceWith({
        user: { findUnique } as unknown as PrismaService['user'],
        friendship: { upsert } as unknown as PrismaService['friendship'],
      });

      await service.linkFromInvite('подделанный-токен', 'жертва', true);

      // Ищем именно по токену — не по `id`, который виден всем.
      expect(findUnique).toHaveBeenCalledWith({
        where: { inviteToken: 'подделанный-токен' },
        select: { id: true },
      });
      expect(upsert).not.toHaveBeenCalled();
    });
  });

  describe('sendRequest', () => {
    /** Куда попал запрос про блокировку — ловим явно, а не через
     * `mock.calls`: у `jest.fn()` они типизированы как `any`. */
    interface BanQuery {
      OR: { leaderId: string; bannedUserId: string }[];
    }

    function prismaWithBan(ban: { id: string } | null) {
      const asked: { where?: BanQuery } = {};
      return {
        asked,
        user: {
          findUnique: jest.fn().mockResolvedValue({ id: 'получатель' }),
        } as unknown as PrismaService['user'],
        roomBan: {
          findFirst: jest.fn((args: { where: BanQuery }) => {
            asked.where = args.where;
            return Promise.resolve(ban);
          }),
        } as unknown as PrismaService['roomBan'],
        $transaction: jest.fn(),
      };
    }

    it('отказывает, если кто-то из двоих заблокировал другого', async () => {
      const prisma = prismaWithBan({ id: 'бан' });
      const service = serviceWith(prisma);

      await expect(
        service.sendRequest('заблокированный', 'получатель'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // До записи дело не дошло.
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('проверяет блокировку в обе стороны, а не только свою', async () => {
      const prisma = prismaWithBan(null);
      const service = serviceWith(prisma);

      await service.sendRequest('отправитель', 'получатель').catch(() => {
        // Транзакция здесь замокана и падает — нам важен только запрос
        // про блокировку, который к этому моменту уже выполнен.
      });

      expect(prisma.asked.where?.OR).toEqual([
        { leaderId: 'отправитель', bannedUserId: 'получатель' },
        { leaderId: 'получатель', bannedUserId: 'отправитель' },
      ]);
    });
  });
});
