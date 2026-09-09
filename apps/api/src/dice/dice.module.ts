import {
  Logger,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DiceController } from './dice.controller';
import { DiceService } from './dice.service';

/** Как часто искать брошенные партии. Реже, чем порог: партию, которую
 * бросили минуту назад, закрывать рано — над риском думают долго. */
const SWEEP_INTERVAL_MS = 5 * 60_000;

@Module({
  imports: [AuthModule],
  controllers: [DiceController],
  providers: [DiceService],
  exports: [DiceService],
})
export class DiceModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiceModule.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly dice: DiceService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      // Уборка не должна ронять сервер: упавший фоновый таймер уносит
      // процесс целиком, и это уже случалось с Redis.
      this.dice.sweepAbandoned().catch((error: unknown) => {
        this.logger.error(`Уборка партий в кости не удалась: ${String(error)}`);
      });
    }, SWEEP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
