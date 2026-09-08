import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isStaffRole, type AppRole } from '@bible-arena/shared';

/**
 * Кто здесь кто — одно место на всё приложение.
 *
 * Ролей две: гейм-мастер (`GAME_MASTER_TELEGRAM_ID`, ровно один) и
 * администраторы (`ADMIN_TELEGRAM_IDS`, список через запятую). Ответ
 * нужен и охранникам эндпоинтов, и профилю, и спискам игроков, и
 * рейтингу; разобранный по-своему в каждом месте, он неминуемо разошёлся
 * бы — достаточно где-нибудь забыть `trim()`, и человек с пробелом в
 * переменной окружения потеряет значок, сохранив права.
 *
 * Разбор — один раз при старте: список меняется только вместе с
 * перезапуском сервиса, а спрашивают его на каждом запросе.
 *
 * Пустые переменные означают «никого» и запрещают всё. Это намеренно:
 * открытая по умолчанию админка страшнее временно закрытой.
 *
 * Гейм-мастер, случайно вписанный ещё и в список администраторов,
 * остаётся гейм-мастером: старшая роль побеждает, а не отбирает права.
 */
@Injectable()
export class AdminRegistry {
  private readonly logger = new Logger(AdminRegistry.name);
  private readonly gameMasterId: string | null;
  private readonly adminIds: ReadonlySet<string>;

  constructor(configService: ConfigService) {
    this.gameMasterId =
      (configService.get<string>('GAME_MASTER_TELEGRAM_ID') ?? '').trim() ||
      null;

    this.adminIds = new Set(
      (configService.get<string>('ADMIN_TELEGRAM_IDS') ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id && id !== this.gameMasterId),
    );

    if (!this.gameMasterId && this.adminIds.size === 0) {
      this.logger.warn(
        'GAME_MASTER_TELEGRAM_ID и ADMIN_TELEGRAM_IDS пусты — управление закрыто для всех',
      );
    } else {
      this.logger.log(
        `Гейм-мастер: ${this.gameMasterId ? 'назначен' : 'не назначен'}; администраторов: ${this.adminIds.size}`,
      );
    }
  }

  roleOf(telegramId: string | null | undefined): AppRole {
    if (!telegramId) return 'PLAYER';
    const id = String(telegramId);
    if (id === this.gameMasterId) return 'GAME_MASTER';
    return this.adminIds.has(id) ? 'ADMIN' : 'PLAYER';
  }

  /** Пускать ли к экрану управления вообще. */
  isStaff(telegramId: string | null | undefined): boolean {
    return isStaffRole(this.roleOf(telegramId));
  }

  isGameMaster(telegramId: string | null | undefined): boolean {
    return this.roleOf(telegramId) === 'GAME_MASTER';
  }
}
