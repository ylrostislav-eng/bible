import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AuthResponse } from '@bible-arena/shared';
import { PresenceService } from '../presence/presence.service';
import { UsersService } from '../users/users.service';
import type { JwtPayload } from './jwt-payload.interface';
import { TelegramAuthService } from './telegram-auth.service';

/** Reserved range, never issued by Telegram (real IDs are always positive). */
const DEV_USER_TELEGRAM_ID_BASE = -1n;

@Injectable()
export class AuthService {
  constructor(
    private readonly telegramAuthService: TelegramAuthService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly presenceService: PresenceService,
    private readonly configService: ConfigService,
  ) {}

  async loginWithTelegram(initData: string): Promise<AuthResponse> {
    const telegramUser = this.telegramAuthService.validate(initData);

    const user = await this.usersService.findOrCreateByTelegramId({
      telegramId: BigInt(telegramUser.id),
      telegramUsername: telegramUser.username ?? null,
      telegramAvatarUrl: telegramUser.photo_url ?? null,
    });

    return this.issueSession(user.id, user.telegramId);
  }

  /**
   * Lets you try the app in a plain browser during local development,
   * without a Telegram bot or tunnel. `slot` (1-5) selects between a handful
   * of fixed accounts, so two duelling players can be simulated in two
   * browser windows on the same machine. Gated by two independent checks,
   * not just one: `NODE_ENV !== 'production'` alone would leave a login
   * backdoor into a fixed set of accounts open on any deployment where
   * `NODE_ENV` was simply left at its default — `ENABLE_DEV_LOGIN` must
   * also be explicitly turned on.
   */
  async devLogin(slot: number): Promise<AuthResponse> {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    const enabled = this.configService.get<boolean>('ENABLE_DEV_LOGIN');
    if (isProduction || !enabled) {
      throw new ForbiddenException('Dev login is disabled');
    }

    const user = await this.usersService.findOrCreateByTelegramId({
      telegramId: DEV_USER_TELEGRAM_ID_BASE - BigInt(slot - 1),
      telegramUsername: `dev_user_${slot}`,
      telegramAvatarUrl: null,
    });

    return this.issueSession(user.id, user.telegramId);
  }

  private async issueSession(
    userId: string,
    telegramId: bigint,
  ): Promise<AuthResponse> {
    const payload: JwtPayload = {
      sub: userId,
      telegramId: telegramId.toString(),
    };
    const accessToken = await this.jwtService.signAsync(payload);

    await this.presenceService.markOnline(userId);
    const freshUser = await this.usersService.touchActivity(userId);

    return {
      accessToken,
      user: this.usersService.toProfile(freshUser),
    };
  }
}
