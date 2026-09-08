import { FriendsService } from './friends.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ContactPolicyService } from '../contact/contact-policy.service';
import type { PresenceService } from '../presence/presence.service';
import type { TelegramBotService } from '../notifications/telegram-bot.service';
import type { ConfigService } from '@nestjs/config';

/**
 * Тест сторожит продуктовое правило, а не код: **сразу в друзья попадает
 * только новичок**.
 *
 * Правило легко сломать в одну строку и невозможно заметить по коду:
 * связь создастся в обоих случаях, просто у существующих аккаунтов она
 * станет появляться без спроса. А ссылку можно разослать веером или
 * выложить в открытый чат — тогда «пригласил» означает не знакомство, а
 * рассылку, и человек обнаруживает в друзьях незнакомых людей.
 *
 * Обратная ошибка не дешевле: если новичку начнут заводить заявку вместо
 * дружбы, приглашение перестаёт работать ровно там, ради чего сделано —
 * человек заходит по ссылке и не видит никого.
 *
 * Первым аргументом идёт **токен** приглашения, а не `id` пригласившего:
 * `id` виден в списке лидеров, и подстановка чужого давала дружбу без
 * спроса (см. `invite-link.spec.ts` и `getInviteLink`).
 */
describe('FriendsService.linkFromInvite', () => {
  interface Upsert {
    create: { userId: string; friendId: string };
  }

  function serviceWith(overrides: {
    userExists?: boolean;
    friendshipUpsert?: jest.Mock;
  }) {
    const friendshipUpsert = overrides.friendshipUpsert ?? jest.fn();
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            overrides.userExists === false ? null : { id: 'inviter' },
          ),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<void>) =>
        fn({
          $executeRaw: jest.fn(),
          friendship: { upsert: friendshipUpsert },
        }),
      ),
    } as unknown as PrismaService;

    const service = new FriendsService(
      prisma,
      {} as PresenceService,
      {} as TelegramBotService,
      {} as ContactPolicyService,
      // Вид ссылки здесь не проверяется — только кого с кем связали.
      { get: () => undefined } as unknown as ConfigService,
    );
    return { service, friendshipUpsert };
  }

  it('новичка сразу делает другом — обе стороны связи', async () => {
    const { service, friendshipUpsert } = serviceWith({});

    await service.linkFromInvite('токен-inviter', 'newbie', true);

    expect(friendshipUpsert).toHaveBeenCalledTimes(2);
    const pairs = (friendshipUpsert.mock.calls as unknown as Upsert[][]).map(
      ([args]) => `${args.create.userId}->${args.create.friendId}`,
    );
    expect(pairs.sort()).toEqual(['inviter->newbie', 'newbie->inviter']);
  });

  it('существующему аккаунту дружбу не навязывает, а шлёт заявку', async () => {
    const { service, friendshipUpsert } = serviceWith({});
    const sendRequest = jest
      .spyOn(service, 'sendRequest')
      .mockResolvedValue(undefined);

    await service.linkFromInvite('токен-inviter', 'oldtimer', false);

    expect(friendshipUpsert).not.toHaveBeenCalled();
    expect(sendRequest).toHaveBeenCalledWith('inviter', 'oldtimer');
  });

  it('по своей же ссылке никого ни с кем не связывает', async () => {
    // Токен принадлежит тому же, кто по нему пришёл: мок отдаёт владельца
    // `inviter`, и он же значится приглашённым.
    const { service, friendshipUpsert } = serviceWith({});

    await service.linkFromInvite('свой-токен', 'inviter', true);

    expect(friendshipUpsert).not.toHaveBeenCalled();
  });

  it('переживает ссылку на удалённый аккаунт', async () => {
    const { service, friendshipUpsert } = serviceWith({ userExists: false });

    await expect(
      service.linkFromInvite('токен-удалённого', 'newbie', true),
    ).resolves.toBeUndefined();
    expect(friendshipUpsert).not.toHaveBeenCalled();
  });

  it('не роняет вход, если связать не удалось', async () => {
    const { service } = serviceWith({
      friendshipUpsert: jest
        .fn()
        .mockRejectedValue(new Error('база отвалилась')),
    });

    await expect(
      service.linkFromInvite('токен-inviter', 'newbie', true),
    ).resolves.toBeUndefined();
  });
});
