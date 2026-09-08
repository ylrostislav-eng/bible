import { ForbiddenException } from '@nestjs/common';
import { HIDE_NAME_STAFF_ONLY_MESSAGE } from '@bible-arena/shared';
import type { AdminRegistry } from '../auth/admin-registry.service';
import type { StaffNameMask } from '../auth/staff-name-mask.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import { UsersService } from './users.service';

/**
 * Скрыть имя может только гейм-мастер или администратор.
 *
 * Правило легко потерять: поле необязательное, приходит в общем запросе
 * профиля рядом с громкостью звука, и без проверки его примут молча — а
 * дальше игрок пропадает из списков безымянной строкой, в том числе для
 * того, кто на него пожаловался.
 *
 * Проверка живёт в сервисе, а не в охраннике маршрута: профиль правится
 * одним `PATCH /users/me`, и охранник закрыл бы заодно всё остальное.
 */
describe('UsersService — право скрыть имя', () => {
  function serviceWith(role: 'GAME_MASTER' | 'ADMIN' | 'PLAYER') {
    const update = jest.fn().mockResolvedValue({ id: 'кто-то' });
    const invalidate = jest.fn();
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ telegramId: 7n }),
        update,
      },
    } as unknown as PrismaService;

    const service = new UsersService(
      prisma,
      {} as RedisService,
      {
        isStaff: () => role !== 'PLAYER',
        roleOf: () => role,
      } as unknown as AdminRegistry,
      { invalidate } as unknown as StaffNameMask,
    );
    return { service, update, invalidate };
  }

  it('гейм-мастеру разрешает и сразу перечитывает маску', async () => {
    const { service, update, invalidate } = serviceWith('GAME_MASTER');

    await service.updateProfile('мастер', { hideName: true });

    const [{ data }] = update.mock.calls[0] as [
      { data: { hideName?: boolean } },
    ];
    expect(data.hideName).toBe(true);
    // Без этого человек нажал «скрыть» и полминуты видит своё имя как
    // прежде — то есть решает, что не сработало.
    expect(invalidate).toHaveBeenCalled();
  });

  it('администратору тоже разрешает', async () => {
    const { service, update } = serviceWith('ADMIN');

    await service.updateProfile('админ', { hideName: true });

    expect(update).toHaveBeenCalled();
  });

  it('игроку отказывает и в базу не пишет', async () => {
    const { service, update } = serviceWith('PLAYER');

    await expect(
      service.updateProfile('игрок', { hideName: true }),
    ).rejects.toThrow(HIDE_NAME_STAFF_ONLY_MESSAGE);
    await expect(
      service.updateProfile('игрок', { hideName: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(update).not.toHaveBeenCalled();
  });

  it('игроку отказывает и при попытке снять скрытие', async () => {
    // Отдельный случай: `false` выглядит безобидно, но проверка одна на
    // оба значения — иначе появляется путь, где поле принимается.
    const { service, update } = serviceWith('PLAYER');

    await expect(
      service.updateProfile('игрок', { hideName: false }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('обычную правку профиля у игрока не задевает', async () => {
    const { service, update, invalidate } = serviceWith('PLAYER');

    await service.updateProfile('игрок', { soundVolume: 50 });

    expect(update).toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
