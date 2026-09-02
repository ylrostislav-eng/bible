import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Gates admin-only endpoints (currently just error telemetry) by Telegram
 * user id. Must run after `JwtAuthGuard` so `request.user` is populated.
 * With `ADMIN_TELEGRAM_IDS` unset, denies everyone — an open admin
 * endpoint is a worse default than a temporarily-locked-out one.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    const allowed = (this.configService.get<string>('ADMIN_TELEGRAM_IDS') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    if (!user || !allowed.includes(user.telegramId)) {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
