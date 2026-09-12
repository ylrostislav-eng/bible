import {
  Logger,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContactModule } from '../contact/contact.module';
import { DiceController } from './dice.controller';
import { DiceService } from './dice.service';

/** Как часто искать брошенные партии. Реже, чем порог: партию, которую
 * бросили минуту назад, закрывать рано — над риском думают долго. */
const SWEEP_INTERVAL_MS = 5 * 60_000;
const TURN_INTERVAL_MS = 750;

@Module({
  imports: [AuthModule, ContactModule],
  controllers: [DiceController],
  providers: [DiceService],
  exports: [DiceService],
})
export class DiceModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiceModule.name);
  private timer?: NodeJS.Timeout;
  private turnTimer?: NodeJS.Timeout;
  private sweepRunning = false;
  private turnTickRunning = false;

  constructor(private readonly dice: DiceService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      if (this.sweepRunning) return;
      this.sweepRunning = true;
      // Уборка не должна ронять сервер: упавший фоновый таймер уносит
      // процесс целиком, и это уже случалось с Redis.
      this.dice
        .sweepAbandoned()
        .catch((error: unknown) => {
          this.logger.error(
            `Уборка партий в кости не удалась: ${String(error)}`,
          );
        })
        .finally(() => {
          this.sweepRunning = false;
        });
    }, SWEEP_INTERVAL_MS);
    this.turnTimer = setInterval(() => {
      if (this.turnTickRunning) return;
      this.turnTickRunning = true;
      this.dice
        .tick()
        .catch((error: unknown) => {
          this.logger.error(
            `Ход программы или таймер не сработал: ${String(error)}`,
          );
        })
        .finally(() => {
          this.turnTickRunning = false;
        });
    }, TURN_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.turnTimer) clearInterval(this.turnTimer);
  }
}
