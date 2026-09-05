import { AbandonedSweeper } from './abandoned.sweeper';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Тест сторожит две вещи, которые легко потерять при правке.
 *
 * Первая — что уборка вообще ищет все три случая: ожидание, которое никто
 * не отменил, дуэль без единого живого игрока и старую одиночную партию.
 * Ветку из `OR` удалить незаметно, а последствие — зависшая партия, из
 * которой игрок не может выйти, и заметит это только он.
 *
 * Вторая — что упавший запрос не роняет приложение. Уборка идёт по
 * таймеру в фоне, и необработанная ошибка здесь валит процесс целиком,
 * унося с собой все живые партии.
 */
describe('AbandonedSweeper', () => {
  /** Что именно ушло в базу. Разбираем один раз и типизированно: без
   *  этого линтер справедливо ругается на доступ к `any`. */
  interface SweepCall {
    where: { OR: { mode?: string; status: string }[] };
    data: { status: string };
  }

  function sweeperWith(updateMany: jest.Mock) {
    const prisma = { gameSession: { updateMany } } as unknown as PrismaService;
    return new AbandonedSweeper(prisma);
  }

  function firstCall(updateMany: jest.Mock): SweepCall {
    return (updateMany.mock.calls as unknown as SweepCall[][])[0][0];
  }

  it('ищет ожидание, молчащую дуэль и старую одиночную партию', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 3 });
    const closed = await sweeperWith(updateMany).sweep();

    expect(closed).toBe(3);
    const args = firstCall(updateMany);
    expect(args.data.status).toBe('ABANDONED');
    expect(
      args.where.OR.map((branch) => `${branch.mode}:${branch.status}`),
    ).toEqual([
      'DUEL:WAITING_FOR_OPPONENT',
      'DUEL:IN_PROGRESS',
      'SOLO:IN_PROGRESS',
    ]);
  });

  it('не трогает завершённые партии', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    await sweeperWith(updateMany).sweep();

    const args = firstCall(updateMany);
    for (const branch of args.where.OR) {
      expect(['COMPLETED', 'ABANDONED']).not.toContain(branch.status);
    }
  });

  it('переживает упавший запрос, а не роняет процесс', async () => {
    const updateMany = jest
      .fn()
      .mockRejectedValue(new Error('база отвалилась'));
    await expect(sweeperWith(updateMany).sweep()).resolves.toBe(0);
  });
});
