import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthResponse } from '@bible-arena/shared';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';
import type { JwtPayload } from './jwt-payload.interface';
import { TelegramAuthService } from './telegram-auth.service';

const ONLINE_PRESENCE_TTL_SECONDS = 60;

@Injectable()
export class AuthService {
  constructor(
    private readonly telegramAuthService: TelegramAuthService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  async loginWithTelegram(initData: string): Promise<AuthResponse> {
    const telegramUser = this.telegramAuthService.validate(initData);

    const user = await this.usersService.findOrCreateByTelegramId({
      telegramId: BigInt(telegramUser.id),
      telegramUsername: telegramUser.username ?? null,
      telegramAvatarUrl: telegramUser.photo_url ?? null,
    });

    const payload: JwtPayload = {
      sub: user.id,
      telegramId: user.telegramId.toString(),
    };
    const accessToken = await this.jwtService.signAsync(payload);

    await this.markOnline(user.id);

    return {
      accessToken,
      user: this.usersService.toProfile(user),
    };
  }

  /** Marks the user as online in Redis so future presence features (friends, rooms) can read it. */
  private async markOnline(userId: string): Promise<void> {
    try {
      await this.redisService.client.set(
        `presence:${userId}`,
        Date.now().toString(),
        'EX',
        ONLINE_PRESENCE_TTL_SECONDS,
      );
    } catch {
      // Presence tracking is best-effort and must never block login.
    }
  }
}
