import { APP_ROLE_LABELS } from '@bible-arena/shared';
import type { PrismaService } from '../prisma/prisma.service';
import type { AdminRegistry } from './admin-registry.service';
import { StaffNameMask } from './staff-name-mask.service';

/**
 * Скрытое имя ломается тихо: маска, забывшая кого-то, не роняет ничего —
 * имя просто видно, и заметить это можно только зайдя вторым аккаунтом.
 * Поэтому правила сторожатся здесь построчно.
 *
 * Особенно два: **скрытие не работает без роли** (иначе снятие прав не
 * возвращает человека в списки) и **в текст идёт метка роли, а не
 * «Игрок»** — подменять личность в чужой переписке нельзя.
 */
describe('StaffNameMask', () => {
  const MASTER = 'мастер';
  const ADMIN = 'админ';
  const PLAYER = 'игрок';

  function make(hidden: Array<{ id: string; telegramId: bigint }>) {
    const roles: Record<string, string> = {
      '1': 'GAME_MASTER',
      '2': 'ADMIN',
    };
    const prisma = {
      user: { findMany: jest.fn().mockResolvedValue(hidden) },
    } as unknown as PrismaService;
    const admins = {
      roleOf: (id: string) => roles[id] ?? 'PLAYER',
    } as unknown as AdminRegistry;

    return new StaffNameMask(prisma, admins);
  }

  async function loaded(hidden: Array<{ id: string; telegramId: bigint }>) {
    const mask = make(hidden);
    mask.onModuleInit();
    // Обновление карты асинхронное — даём промису обновления дорисоваться.
    await Promise.resolve();
    await Promise.resolve();
    return mask;
  }

  it('вырезает имя скрывшегося и не трогает остальных', async () => {
    const mask = await loaded([{ id: MASTER, telegramId: 1n }]);

    expect(mask.nickname(MASTER, 'Ростислав')).toBeNull();
    expect(mask.nickname(PLAYER, 'Пётр')).toBe('Пётр');
  });

  it('в текст подставляет метку роли, а не «Игрок»', async () => {
    const mask = await loaded([
      { id: MASTER, telegramId: 1n },
      { id: ADMIN, telegramId: 2n },
    ]);

    expect(mask.label(MASTER, 'Ростислав')).toBe(APP_ROLE_LABELS.GAME_MASTER);
    expect(mask.label(ADMIN, 'Пётр')).toBe(APP_ROLE_LABELS.ADMIN);
    expect(mask.label(PLAYER, 'Иван')).toBe('Иван');
  });

  it('не скрывает того, у кого роль отобрали, а флаг остался', async () => {
    // Иначе снятие прав оставляло бы человека безымянным навсегда.
    const mask = await loaded([{ id: PLAYER, telegramId: 99n }]);

    expect(mask.isHidden(PLAYER)).toBe(false);
    expect(mask.nickname(PLAYER, 'Иван')).toBe('Иван');
  });

  it('до первой загрузки ничего не скрывает и не падает', () => {
    // Запрос может прийти в первые миллисекунды после старта.
    const mask = make([{ id: MASTER, telegramId: 1n }]);

    expect(mask.nickname(MASTER, 'Ростислав')).toBe('Ростислав');
    expect(mask.label(MASTER, 'Ростислав')).toBe('Ростислав');
  });

  it('при отказе базы держит прежнюю карту, а не открывает имена', async () => {
    const mask = await loaded([{ id: MASTER, telegramId: 1n }]);
    (
      mask as unknown as { prisma: { user: { findMany: jest.Mock } } }
    ).prisma.user.findMany.mockRejectedValue(new Error('база отвалилась'));

    mask.invalidate();
    await Promise.resolve();
    await Promise.resolve();

    expect(mask.nickname(MASTER, 'Ростислав')).toBeNull();
  });
});
