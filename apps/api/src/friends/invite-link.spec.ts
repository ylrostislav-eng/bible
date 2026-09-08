import { ForbiddenException } from '@nestjs/common';
import { FriendsService } from './friends.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ContactPolicyService } from '../contact/contact-policy.service';
import type { PresenceService } from '../presence/presence.service';
import type { AdminRegistry } from '../auth/admin-registry.service';
import type { StaffNameMask } from '../auth/staff-name-mask.service';
import type { TelegramBotService } from '../notifications/telegram-bot.service';
import type { ConfigService } from '@nestjs/config';

/** Настройки здесь ни на что не влияют: проверяется связывание, а не вид
 * ссылки (за него отвечает `notifications/invite-link.spec.ts`). */
function configStub(): ConfigService {
  return { get: () => undefined } as unknown as ConfigService;
}

/**
 * ## Приглашение по ссылке
 *
 * Дыра, найденная аудитом безопасности. В ссылке стоял `id` пользователя, а
 * параметр запуска приходит от клиента и ничем не подписан. Для **нового**
 * аккаунта приглашение создаёт не заявку, а сразу взаимную дружбу — и это
 * правильно, пока ссылку раздаёт сам владелец. Но `id` любого игрока виден
 * в списке лидеров, поэтому достаточно было завести свежий аккаунт и
 * открыть приложение с `ref_<чужой id>`, чтобы стать другом кого угодно без
 * его ведома.
 *
 * На момент находки дружба открывала личную переписку — переписки больше
 * нет. Дружба перестала быть и пропуском к вызову на дуэль. Но навязанная
 * дружба остаётся дырой: она поднимает чужого человека в список «своих» и
 * показывает, когда он в сети.
 *
 * ## Заявка мимо правил
 *
 * Кнопку интерфейс прятал, но запрос к `/friends/requests` отправляется и
 * без интерфейса, а заявка приходит уведомлением. Сами правила (чёрный
 * список, ограничение по жалобам, детский случай) живут в
 * `ContactPolicyService` и проверяются там же — здесь проверяется одно:
 * что заявка вообще их спрашивает, и спрашивает **до** записи в базу.
 */
describe('FriendsService — подделка приглашения и правила заявки', () => {
  function serviceWith(
    prisma: Partial<PrismaService>,
    contactPolicy: Partial<ContactPolicyService> = {
      assertCanReach: jest.fn().mockResolvedValue(undefined),
    },
  ) {
    return new FriendsService(
      prisma as PrismaService,
      {} as PresenceService,
      {} as TelegramBotService,
      contactPolicy as ContactPolicyService,
      configStub(),
      {} as AdminRegistry,
      {} as StaffNameMask,
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
    function prismaStub() {
      return {
        user: {
          findUnique: jest.fn().mockResolvedValue({ id: 'получатель' }),
        } as unknown as PrismaService['user'],
        $transaction: jest.fn(),
      };
    }

    it('спрашивает правило доступа и не пишет в базу при отказе', async () => {
      const prisma = prismaStub();
      const assertCanReach = jest
        .fn()
        .mockRejectedValue(new ForbiddenException());
      const service = serviceWith(prisma, { assertCanReach });

      await expect(
        service.sendRequest('отправитель', 'получатель'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(assertCanReach).toHaveBeenCalledWith('отправитель', 'получатель');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('не спрашивает правило для заявки самому себе — отказ раньше', async () => {
      const prisma = prismaStub();
      const assertCanReach = jest.fn();
      const service = serviceWith(prisma, { assertCanReach });

      await expect(service.sendRequest('я', 'я')).rejects.toThrow();

      expect(assertCanReach).not.toHaveBeenCalled();
    });
  });
});
