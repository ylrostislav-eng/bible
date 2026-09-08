import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AdminRegistry } from '../auth/admin-registry.service';
import { AdminGuard, GameMasterGuard } from '../auth/guards/admin.guard';
import { AdminService, type AdminIdentity } from './admin.service';
import type { PresenceService } from '../presence/presence.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TelegramBotService } from '../notifications/telegram-bot.service';
import type { UsersService } from '../users/users.service';

/**
 * Права администратора проверяются здесь двумя разными вопросами, и
 * путать их нельзя: «кого пускаем» (реестр и охранник) и «что нельзя даже
 * тому, кого пустили» (правила самого сервиса).
 *
 * Второй вопрос важнее: первый ломается заметно — админка просто не
 * открывается, — а второй тихо, и узнать о поломке можно только по
 * удалённому не тому аккаунту.
 */
describe('Кто есть кто', () => {
  const registryWith = (gameMaster?: string, admins?: string) =>
    new AdminRegistry({
      get: (key: string) =>
        key === 'GAME_MASTER_TELEGRAM_ID' ? gameMaster : admins,
    } as unknown as ConfigService);

  it('узнаёт гейм-мастера', () => {
    expect(registryWith('777', '111,222').roleOf('777')).toBe('GAME_MASTER');
  });

  it('узнаёт администратора из списка', () => {
    expect(registryWith('777', '111,222').roleOf('222')).toBe('ADMIN');
  });

  it('всех остальных считает игроками', () => {
    expect(registryWith('777', '111').roleOf('333')).toBe('PLAYER');
  });

  it('терпит пробелы вокруг запятых — их ставят руками в панели', () => {
    expect(registryWith('777', ' 111 , 222 ').roleOf('222')).toBe('ADMIN');
  });

  it('гейм-мастер в списке админов остаётся гейм-мастером', () => {
    expect(registryWith('777', '777,111').roleOf('777')).toBe('GAME_MASTER');
  });

  it('пустые переменные закрывают управление всем, а не открывают всем', () => {
    expect(registryWith('', '').isStaff('111')).toBe(false);
    expect(registryWith(undefined, undefined).isStaff('111')).toBe(false);
  });

  it('не пускает гостя без telegramId', () => {
    expect(registryWith('777', '111').isStaff(null)).toBe(false);
    expect(registryWith('777', '111').isStaff(undefined)).toBe(false);
  });

  it('охранник отказывает, когда пользователя в запросе нет вовсе', () => {
    const guard = new AdminGuard(registryWith('777', '111'));
    const context = {
      switchToHttp: () => ({ getRequest: () => ({}) }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('охранник пускает и администратора, и гейм-мастера', () => {
    const guard = new AdminGuard(registryWith('777', '111'));
    const ctx = (telegramId: string) =>
      ({
        switchToHttp: () => ({ getRequest: () => ({ user: { telegramId } }) }),
      }) as unknown as ExecutionContext;
    expect(guard.canActivate(ctx('111'))).toBe(true);
    expect(guard.canActivate(ctx('777'))).toBe(true);
  });

  it('охранник необратимого пускает только гейм-мастера', () => {
    const guard = new GameMasterGuard(registryWith('777', '111'));
    const ctx = (telegramId: string) =>
      ({
        switchToHttp: () => ({ getRequest: () => ({ user: { telegramId } }) }),
      }) as unknown as ExecutionContext;
    expect(guard.canActivate(ctx('777'))).toBe(true);
    expect(() => guard.canActivate(ctx('111'))).toThrow(ForbiddenException);
  });
});

describe('Что кому нельзя', () => {
  const MASTER: AdminIdentity = {
    userId: 'gm-1',
    nickname: 'MrAdmin',
    role: 'GAME_MASTER',
  };
  const ADMIN_ACTOR: AdminIdentity = {
    userId: 'admin-1',
    nickname: 'Helper',
    role: 'ADMIN',
  };

  interface Target {
    id: string;
    nickname: string | null;
    telegramId: bigint;
    coins?: number;
  }

  function serviceWith(target: Target) {
    const created: unknown[] = [];
    const updates: unknown[] = [];
    const deletes: unknown[] = [];

    const prisma = {
      user: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            coins: 0,
            rating: 100,
            level: 1,
            experience: 0,
            gamesPlayed: 0,
            duelsPlayed: 0,
            gamesWon: 0,
            gamesLost: 0,
            gamesDrawn: 0,
            currentStreak: 0,
            longestStreak: 0,
            mutedUntil: null,
            ageBand: null,
            guardianPinHash: null,
            avatarUrl: null,
            country: null,
            telegramUsername: null,
            remindersEnabled: true,
            inviteNotificationsEnabled: true,
            lastActiveAt: new Date(),
            createdAt: new Date(),
            ...target,
          }),
        ),
        update: jest.fn((args: unknown) => {
          updates.push(args);
          return Promise.resolve({});
        }),
        delete: jest.fn((args: unknown) => {
          deletes.push(args);
          return Promise.resolve({});
        }),
      },
      abuseReport: { count: jest.fn(() => Promise.resolve(0)) },
      adminAction: {
        create: jest.fn((args: unknown) => {
          created.push(args);
          return Promise.resolve({});
        }),
      },
    } as unknown as PrismaService;

    const service = new AdminService(
      prisma,
      { areOnline: () => Promise.resolve({}) } as unknown as PresenceService,
      {} as TelegramBotService,
      {} as UsersService,
      new AdminRegistry({
        // Гейм-мастер — «777», администратор — «222»; цель теста бывает
        // и тем, и другим, и обычным игроком.
        get: (key: string) =>
          key === 'GAME_MASTER_TELEGRAM_ID' ? '777' : '222',
      } as unknown as ConfigService),
    );

    return { service, created, updates, deletes };
  }

  it('администратор не может ограничить другого администратора', async () => {
    const { service, updates } = serviceWith({
      id: 'other-admin',
      nickname: 'Second',
      telegramId: 222n,
    });
    await expect(service.mute(ADMIN_ACTOR, 'other-admin', 24)).rejects.toThrow(
      ForbiddenException,
    );
    expect(updates).toHaveLength(0);
  });

  it('гейм-мастер своего администратора ограничить может', async () => {
    const { service, updates } = serviceWith({
      id: 'other-admin',
      nickname: 'Second',
      telegramId: 222n,
    });
    await service.mute(MASTER, 'other-admin', 24);
    expect(updates).toHaveLength(1);
  });

  it('администратор не может тронуть гейм-мастера', async () => {
    const { service, updates } = serviceWith({
      id: 'gm-1',
      nickname: 'MrAdmin',
      telegramId: 777n,
    });
    await expect(service.mute(ADMIN_ACTOR, 'gm-1', 24)).rejects.toThrow(
      ForbiddenException,
    );
    expect(updates).toHaveLength(0);
  });

  it('администратору недоступно необратимое: баланс, удаление, рассылка', async () => {
    const { service, updates, deletes } = serviceWith({
      id: 'player-1',
      nickname: 'Vasya',
      telegramId: 5n,
    });
    await expect(
      service.adjustBalance(ADMIN_ACTOR, 'player-1', { coins: 10 }),
    ).rejects.toThrow(/гейм-мастер/i);
    await expect(
      service.deleteAccount(ADMIN_ACTOR, 'player-1', 'Vasya'),
    ).rejects.toThrow(/гейм-мастер/i);
    await expect(
      service.broadcast(ADMIN_ACTOR, 'ALL', 'привет'),
    ).rejects.toThrow(/гейм-мастер/i);
    expect(updates).toHaveLength(0);
    expect(deletes).toHaveLength(0);
  });

  it('не даёт удалить самого себя', async () => {
    const { service, deletes } = serviceWith({
      id: 'gm-1',
      nickname: 'MrAdmin',
      telegramId: 777n,
    });
    await expect(
      service.deleteAccount(MASTER, 'gm-1', 'MrAdmin'),
    ).rejects.toThrow(ForbiddenException);
    expect(deletes).toHaveLength(0);
  });

  it('не удаляет, если ник для подтверждения не совпал', async () => {
    const { service, deletes } = serviceWith({
      id: 'player-1',
      nickname: 'Vasya',
      telegramId: 5n,
    });
    await expect(
      service.deleteAccount(MASTER, 'player-1', 'vasya'),
    ).rejects.toThrow(/не совпал/);
    expect(deletes).toHaveLength(0);
  });

  it('удаляет, когда ник переписан верно, и пишет это в журнал', async () => {
    const { service, deletes, created } = serviceWith({
      id: 'player-1',
      nickname: 'Vasya',
      telegramId: 5n,
    });
    await service.deleteAccount(MASTER, 'player-1', 'Vasya');
    expect(deletes).toHaveLength(1);
    expect(created).toHaveLength(1);
  });

  it('отказывает в бессмысленном сроке ограничения', async () => {
    const { service } = serviceWith({
      id: 'player-1',
      nickname: 'Vasya',
      telegramId: 5n,
    });
    await expect(service.mute(MASTER, 'player-1', 0)).rejects.toThrow(
      /Некорректный срок/,
    );
    await expect(service.mute(MASTER, 'player-1', 100000)).rejects.toThrow(
      /Некорректный срок/,
    );
  });

  it('не уводит монеты в минус при списании больше остатка', async () => {
    const { service, updates } = serviceWith({
      id: 'player-1',
      nickname: 'Vasya',
      telegramId: 5n,
      coins: 30,
    });
    await service.adjustBalance(MASTER, 'player-1', { coins: -100 });
    expect(updates[0]).toMatchObject({ data: { coins: 0 } });
  });

  it('отказывает в правке баланса, которая ничего не меняет', async () => {
    const { service } = serviceWith({
      id: 'player-1',
      nickname: 'Vasya',
      telegramId: 5n,
    });
    await expect(
      service.adjustBalance(MASTER, 'player-1', { coins: 0, rating: 0 }),
    ).rejects.toThrow(/Нечего менять/);
  });

  it('пишет в журнал ник цели на момент действия, а не ссылку на неё', async () => {
    const { service, created } = serviceWith({
      id: 'player-1',
      nickname: 'Vasya',
      telegramId: 5n,
    });
    await service.mute(MASTER, 'player-1', 24, 'ругался');
    expect(created[0]).toMatchObject({
      data: {
        adminNickname: 'MrAdmin',
        actorRole: 'GAME_MASTER',
        targetNickname: 'Vasya',
        kind: 'MUTE',
        summary: 'Ограничение на 24 ч: ругался',
      },
    });
  });

  it('в журнал попадает и работа администратора — со своей ролью', async () => {
    const { service, created } = serviceWith({
      id: 'player-1',
      nickname: 'Vasya',
      telegramId: 5n,
    });
    await service.mute(ADMIN_ACTOR, 'player-1', 12);
    expect(created[0]).toMatchObject({
      data: {
        adminUserId: 'admin-1',
        adminNickname: 'Helper',
        actorRole: 'ADMIN',
        targetNickname: 'Vasya',
      },
    });
  });
});
