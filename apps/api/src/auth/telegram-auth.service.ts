import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';

export interface TelegramInitDataUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
}

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

/**
 * Validates the `initData` string Telegram signs for every Mini App launch.
 * Algorithm: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
@Injectable()
export class TelegramAuthService {
  constructor(private readonly configService: ConfigService) {}

  validate(initData: string): TelegramInitDataUser {
    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      throw new UnauthorizedException(
        'Telegram authentication is not configured on the server',
      );
    }

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) {
      throw new UnauthorizedException('Missing Telegram hash');
    }
    params.delete('hash');

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (!this.hashesMatch(computedHash, hash)) {
      throw new UnauthorizedException('Invalid Telegram authentication data');
    }

    const authDate = Number(params.get('auth_date'));
    if (!authDate || Date.now() / 1000 - authDate > MAX_AUTH_AGE_SECONDS) {
      throw new UnauthorizedException(
        'Telegram authentication data has expired',
      );
    }

    const userRaw = params.get('user');
    if (!userRaw) {
      throw new UnauthorizedException('Missing Telegram user data');
    }

    try {
      return JSON.parse(userRaw) as TelegramInitDataUser;
    } catch {
      throw new UnauthorizedException('Malformed Telegram user data');
    }
  }

  private hashesMatch(computedHex: string, receivedHex: string): boolean {
    const computed = Buffer.from(computedHex, 'hex');
    const received = Buffer.from(receivedHex, 'hex');
    return (
      computed.length === received.length &&
      crypto.timingSafeEqual(computed, received)
    );
  }
}
