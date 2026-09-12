import { DiceModule } from './dice.module';
import type { DiceService } from './dice.service';

describe('DiceModule', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not overlap turn ticks when the previous tick is still running', async () => {
    jest.useFakeTimers();

    let finishTick: (() => void) | undefined;
    const pendingTick = new Promise<void>((resolve) => {
      finishTick = resolve;
    });
    const tick = jest
      .fn()
      .mockReturnValueOnce(pendingTick)
      .mockResolvedValue(undefined);
    const dice = {
      sweepAbandoned: jest.fn().mockResolvedValue(undefined),
      tick,
    } as unknown as DiceService;
    const module = new DiceModule(dice);

    module.onModuleInit();
    jest.advanceTimersByTime(2_250);
    expect(tick).toHaveBeenCalledTimes(1);

    finishTick?.();
    await pendingTick;
    await Promise.resolve();
    jest.advanceTimersByTime(750);
    expect(tick).toHaveBeenCalledTimes(2);

    module.onModuleDestroy();
  });
});
