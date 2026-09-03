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

  /** Optional in development so the app can boot before a bot token exists. */
  @IsString()
  @IsOptional()
  TELEGRAM_BOT_TOKEN?: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN: string = '30d';

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
