import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type TelegramSendResult =
  /** Delivered. */
  | { status: 'sent' }
  /** No bot token configured — the feature is simply off. */
  | { status: 'disabled' }
  /** Telegram says this person blocked the bot or deleted the chat. Stop
   * messaging them; there is nothing to retry. */
  | { status: 'blocked' }
  /** Anything else: network trouble, rate limit, Telegram being down. Worth
   * trying again later. */
  | { status: 'failed'; reason: string };

/**
 * The one place that talks to the Telegram Bot API.
 *
 * Without `TELEGRAM_BOT_TOKEN` every send is a no-op that reports
 * `disabled` — so a deployment that hasn't set up a bot silently sends
 * nothing rather than erroring on a schedule. Nothing outbound happens
 * until the owner puts a real token in.
 */
@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);
  private warnedAboutMissingToken = false;

  constructor(private readonly configService: ConfigService) {}

  private get token(): string | undefined {
    return this.configService.get<string>('TELEGRAM_BOT_TOKEN') || undefined;
  }

  /** Overridable so the delivery path can be exercised against a local stub
   * — otherwise the only way to test it is to message real people. */
  private get apiBase(): string {
    return (
      this.configService.get<string>('TELEGRAM_API_BASE') ||
      'https://api.telegram.org'
    );
  }

  async sendMessage(
    telegramId: bigint,
    text: string,
  ): Promise<TelegramSendResult> {
    const token = this.token;
    if (!token) {
      if (!this.warnedAboutMissingToken) {
        // Once, not on every sweep: this is a configuration state, not an
        // incident, and a log line every few minutes would bury real ones.
        this.logger.log(
          'TELEGRAM_BOT_TOKEN is not set — Telegram messages are disabled',
        );
        this.warnedAboutMissingToken = true;
      }
      return { status: 'disabled' };
    }

    try {
      const response = await fetch(`${this.apiBase}/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramId.toString(),
          text,
          // The reminder is one plain sentence; markup would only add ways
          // for it to render wrong on someone's client.
          disable_notification: false,
        }),
      });

      if (response.ok) return { status: 'sent' };

      const body: unknown = await response.json().catch(() => null);
      const description =
        body && typeof body === 'object' && 'description' in body
          ? String(body.description)
          : `HTTP ${response.status}`;

      // 403 is Telegram's way of saying "this person doesn't want your
      // messages" — blocked the bot, or deleted the chat. Retrying is both
      // useless and rude, so the caller turns reminders off for them.
      if (response.status === 403) {
        return { status: 'blocked' };
      }
      return { status: 'failed', reason: description };
    } catch (error) {
      return {
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
