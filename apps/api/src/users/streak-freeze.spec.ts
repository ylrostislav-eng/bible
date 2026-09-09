import type { AdminRegistry } from '../auth/admin-registry.service';
import type { StaffNameMask } from '../auth/staff-name-mask.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import { UsersService } from './users.service';

/**
 * «Хранитель серии» из лавки: пропущенный день не обрывает счёт.
 *
 * Набор написан до того, как правило проверялось вживую, — иначе он
 * измерял бы не правило, а то, что случайно получилось.
 *
 * Главное здесь — не «серия продолжилась», а два условия, на которых легко
 * обмануть игрока: списывать ровно за пропущенные дни и не списывать
 * вовсе, если запаса всё равно не хватает. Второе важнее первого: человек,
 * потерявший и серию, и хранителей, заплатил ни за что.
 */
describe('UsersService — хранитель серии', () => {
  /** Вызывает приватный расчёт напрямую: он чистый, и гонять ради него
   * всю транзакцию начисления — значит проверять транзакцию, а не
   * правило. */
  function compute(user: {
    currentStreak: number;
    longestStreak: number;
    streakFreezes: number;
    daysAgo: number | null;
  }) {
    const service = new UsersService(
      {} as PrismaService,
      {} as RedisService,
      {} as AdminRegistry,
      {} as StaffNameMask,
    );

    // Тот же формат, в котором дату отдаёт колонка `@db.Date`:
    // UTC-полночь того дня, которым её пометили.
    const today = new Date();
    const label = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const lastActivityDate =
      user.daysAgo === null
        ? null
        : new Date(label.getTime() - user.daysAgo * 86_400_000);

    return (
      service as unknown as {
        computeStreakUpdate: (
          user: unknown,
          offset: number,
        ) => {
          currentStreak: number;
          longestStreak: number;
          increased: boolean;
          freezesSpent: number;
        };
      }
    ).computeStreakUpdate(
      {
        currentStreak: user.currentStreak,
        longestStreak: user.longestStreak,
        streakFreezes: user.streakFreezes,
        lastActivityDate,
      },
      0,
    );
  }

  it('без пропуска хранителей не тратит', () => {
    const result = compute({
      currentStreak: 5,
      longestStreak: 5,
      streakFreezes: 3,
      daysAgo: 1,
    });

    expect(result.currentStreak).toBe(6);
    expect(result.freezesSpent).toBe(0);
  });

  it('за пропущенный день тратит одного и держит серию', () => {
    const result = compute({
      currentStreak: 9,
      longestStreak: 9,
      streakFreezes: 2,
      daysAgo: 2,
    });

    expect(result.currentStreak).toBe(10);
    expect(result.freezesSpent).toBe(1);
  });

  it('за три пропущенных дня тратит трёх', () => {
    const result = compute({
      currentStreak: 4,
      longestStreak: 4,
      streakFreezes: 3,
      daysAgo: 4,
    });

    expect(result.currentStreak).toBe(5);
    expect(result.freezesSpent).toBe(3);
  });

  it('когда запаса не хватает — не тратит ничего и рвёт серию', () => {
    // Худший исход, ради которого набор и написан: списать двух из трёх
    // нужных значит взять плату и не дать защиты.
    const result = compute({
      currentStreak: 30,
      longestStreak: 30,
      streakFreezes: 2,
      daysAgo: 4,
    });

    expect(result.currentStreak).toBe(1);
    expect(result.freezesSpent).toBe(0);
  });

  it('без хранителей ведёт себя как раньше', () => {
    const result = compute({
      currentStreak: 12,
      longestStreak: 12,
      streakFreezes: 0,
      daysAgo: 3,
    });

    expect(result.currentStreak).toBe(1);
    expect(result.freezesSpent).toBe(0);
  });

  it('вторая игра в тот же день ничего не трогает', () => {
    const result = compute({
      currentStreak: 7,
      longestStreak: 7,
      streakFreezes: 3,
      daysAgo: 0,
    });

    expect(result.currentStreak).toBe(7);
    expect(result.increased).toBe(false);
    expect(result.freezesSpent).toBe(0);
  });

  it('рекорд серии переживает спасение пропуска', () => {
    const result = compute({
      currentStreak: 20,
      longestStreak: 20,
      streakFreezes: 1,
      daysAgo: 2,
    });

    expect(result.longestStreak).toBe(21);
  });
});
