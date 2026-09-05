import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

/** Below this, an HMAC secret is trivially brute-forceable — only enforced
 * in production so local dev can keep using a short placeholder value. */
const JWT_SECRET_MIN_LENGTH_PRODUCTION = 32;

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3001;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  CORS_ORIGIN!: string;

  /** Optional in development so the app can boot before a bot token exists.
   * While it's unset, the bot sends nothing at all. */
  @IsString()
  @IsOptional()
  TELEGRAM_BOT_TOKEN?: string;

  /** Where the Bot API lives. Only ever set away from the default to point
   * a test at a local stub — otherwise the delivery path could only be
   * exercised by messaging real people. */
  @IsString()
  @IsOptional()
  TELEGRAM_API_BASE?: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  /**
   * Срок жизни токена доступа.
   *
   * Было тридцать дней. Это значило, что утёкший токен — из логов, из
   * чужого устройства, из ошибки в стороннем коде — открывал аккаунт на
   * месяц, и отобрать его было нечем: подпись валидна, отзыва нет.
   *
   * Пятнадцать минут ограничивают ущерб, ничего не ломая: клиент держит
   * токен только в памяти вкладки и умеет молча войти заново по данным
   * Telegram (см. `setSessionRecovery` в `apps/web/src/lib/api.ts`).
   * Игрок этого не замечает.
   *
   * Сюда же попадает бан: заблокированный игрок теряет доступ в пределах
   * этого срока, а не носит валидный токен месяц.
   */
  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN: string = '15m';

  /// Comma-separated Telegram user ids allowed to read/resolve error
  /// telemetry (see `AdminGuard`). Unset means nobody can — a safe default
  /// rather than an open admin endpoint.
  @IsString()
  @IsOptional()
  ADMIN_TELEGRAM_IDS?: string;

  /// Explicit opt-in for `/auth/dev-login`, independent of `NODE_ENV` — see
  /// `AuthService.devLogin`. Defaults off: a misconfigured `NODE_ENV` on a
  /// real deployment (left at "development" by mistake) must not be enough
  /// on its own to leave a fixed-account login backdoor open.
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  ENABLE_DEV_LOGIN: boolean = false;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n${errors.toString()}`);
  }

  // A weak JWT_SECRET is invisible until someone forges a token with it —
  // worth failing loudly at boot instead. Only gated to production so
  // local dev can keep using the short placeholder from `.env.example`.
  if (
    validated.NODE_ENV === NodeEnv.Production &&
    validated.JWT_SECRET.length < JWT_SECRET_MIN_LENGTH_PRODUCTION
  ) {
    throw new Error(
      `JWT_SECRET is too weak for production: must be at least ${JWT_SECRET_MIN_LENGTH_PRODUCTION} characters`,
    );
  }

  return validated;
}
