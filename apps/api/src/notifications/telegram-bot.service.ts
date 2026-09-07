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

  /**
   * Имя бота — то, из чего собирается ссылка-приглашение
   * (`t.me/<имя>/app?startapp=...`).
   *
   * Спрашивается у самого Telegram, а не берётся из переменной окружения:
   * токен у нас уже есть, а лишняя переменная — это ещё одно место, где
   * можно опечататься и обнаружить это только по неработающим ссылкам у
   * игроков.
   *
   * Кешируется только удача. Неудача не запоминается намеренно: сеть могла
   * моргнуть на старте, и запомненный `null` означал бы, что приглашения не
   * работают до перезапуска сервера.
   */
  private cachedUsername: string | null = null;

  async getBotUsername(): Promise<string | null> {
    if (this.cachedUsername) return this.cachedUsername;

    const token = this.token;
    if (!token) return null;

    try {
      const response = await fetch(`${this.apiBase}/bot${token}/getMe`);
      if (!response.ok) return null;

      const body: unknown = await response.json();
      const username =
        body &&
        typeof body === 'object' &&
        'result' in body &&
        body.result &&
        typeof body.result === 'object' &&
        'username' in body.result &&
        typeof body.result.username === 'string'
          ? body.result.username
          : null;

      if (username) this.cachedUsername = username;
      return username;
    } catch (error) {
      this.logger.warn(`Не удалось узнать имя бота: ${String(error)}`);
      return null;
    }
  }

  /**
   * @param openApp Кнопка под сообщением, открывающая мини-приложение по
   * этому адресу.
   *
   * Именно кнопка, а не ссылка в тексте. Ссылка вида
   * `t.me/<бот>/app?startapp=…` ведёт в **Main Mini App**, а он существует,
   * только если назначен в BotFather. _Живой случай: сообщение приходило,
   * ссылка нажималась, приложение не открывалось — и понять почему по
   * приложению невозможно, потому что ошибки нет ни на одной стороне._
   * Кнопка `web_app` открывает приложение по прямому адресу и от настроек
   * бота не зависит; работает она в личной переписке, а именно туда бот и
   * пишет.
   */
  async sendMessage(
    telegramId: bigint,
    text: string,
    openApp?: { label: string; url: string },
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
          ...(openApp
            ? {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: openApp.label, web_app: { url: openApp.url } }],
                  ],
                },
              }
            : {}),
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
