import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramBotService } from './telegram-bot.service';

/** Путь, по которому Telegram приносит входящие. Тот же и в контроллере, и
 * в подписке — расхождение здесь означало бы молчащего бота. */
export const TELEGRAM_WEBHOOK_PATH = 'telegram/webhook';

/** `/start ref_<токен>` — приглашение в друзья по ссылке. Разбор такой же,
 * как у `AuthService.parseInviteParam`: это фильтр мусора, не защита. */
const START_PAYLOAD = /^ref_[A-Za-z0-9_-]{16,64}$/;

interface TelegramMessage {
  text?: string;
  from?: { id?: number; first_name?: string };
  chat?: { id?: number; type?: string };
}

/**
 * Входящие сообщения бота: почему «Старт» перестал быть тупиком.
 *
 * ## Что было
 *
 * Бот умел только писать. Ссылка-приглашение вида `t.me/<бот>?start=…`
 * открывала чат с ботом и кнопку «Старт», человек её нажимал — и не
 * происходило **ничего**: сообщение уходило в никуда, потому что вебхука
 * не было. Приглашённый видел пустой чат с молчащим ботом и уходил.
 *
 * ## Что теперь
 *
 * На `/start` бот отвечает сообщением с кнопкой «Открыть игру». Приглашение
 * из ссылки (`/start ref_<токен>`) уезжает в адрес кнопки параметром
 * `invite`, и приложение при входе отдаёт его серверу — так пришедший
 * попадает в друзья к тому, кто позвал, даже если дорога шла через бота
 * (см. `launch-invite.ts` и `AuthService.loginWithTelegram`).
 *
 * ## Заодно — разрешение писать
 *
 * Нажатие «Старт» создаёт переписку, и с этого мгновения боту разрешено
 * писать этому человеку. Отмечаем это здесь: иначе приложение будет
 * спрашивать разрешение, которое уже есть.
 *
 * ## Чем закрыт открытый эндпоинт
 *
 * Адрес вебхука открыт всему интернету — прислать по нему выдуманное
 * «сообщение» может кто угодно. Единственная защита — секрет, который
 * Telegram возвращает в заголовке каждой доставки. Секрет не заводится
 * переменной окружения (её забудут поставить, и вебхук либо не включится,
 * либо включится без проверки), а выводится из токена бота: одинаковый на
 * всех копиях сервера, меняется вместе с токеном и не угадывается, не зная
 * токена. `TELEGRAM_WEBHOOK_SECRET` при этом остаётся — им можно задать
 * секрет вручную, если когда-нибудь понадобится.
 */
@Injectable()
export class TelegramUpdatesService implements OnModuleInit {
  private readonly logger = new Logger(TelegramUpdatesService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly telegramBot: TelegramBotService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    // Не ждём результата: подписка — дело сети, и сервер не должен из-за
    // неё задерживать старт. Неудача попадёт в лог и повторится при
    // следующем запуске.
    void this.registerWebhook();
  }

  /**
   * Секрет доставки. `null` — токена бота нет, значит бота нет вовсе и
   * принимать нечего.
   */
  get secret(): string | null {
    const explicit = (
      this.configService.get<string>('TELEGRAM_WEBHOOK_SECRET') ?? ''
    ).trim();
    if (explicit) return explicit;

    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) return null;

    // Telegram разрешает в секрете только `A-Za-z0-9_-`, до 256 символов, —
    // hex подходит целиком.
    return createHmac('sha256', token).update('telegram-webhook').digest('hex');
  }

  /** Совпадает ли заголовок доставки с нашим секретом. Сравнение
   * постоянного времени: обычное `===` по чужому запросу выдаёт секрет по
   * времени ответа побайтно. */
  verifySecret(received: string | undefined): boolean {
    const expected = this.secret;
    if (!expected || !received) return false;

    const a = Buffer.from(expected);
    const b = Buffer.from(received);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * Разбирает доставку. Возвращает управление быстро и молча: Telegram
   * повторяет доставку, на которую не ответили за секунды, а повтор
   * «Старта» — это второе такое же сообщение человеку.
   */
  async handleUpdate(update: unknown): Promise<void> {
    const message = this.messageOf(update);
    const telegramId = message?.from?.id;
    if (!message?.text || !telegramId) return;

    // Личная переписка и только она: в группе бот нам не нужен, а «Старт»
    // там означает не то же самое.
    if (message.chat?.type && message.chat.type !== 'private') return;

    // Написал что угодно — значит, переписка есть и писать ему можно.
    await this.markCanWrite(telegramId);

    const [command, payload] = message.text.trim().split(/\s+/, 2);
    // `/start@имя_бота` приходит из групп; в личной переписке всегда просто
    // `/start`, но разбирать оба дешевле, чем однажды не узнать команду.
    const isStart = command === '/start' || command.startsWith('/start@');

    // На любое другое сообщение отвечаем тем же — кнопкой: человек написал
    // боту, потому что ищет вход в игру, а не переписку с ним.
    await this.reply(
      telegramId,
      isStart && payload && START_PAYLOAD.test(payload) ? payload : null,
    );
  }

  /**
   * Ответ с кнопкой «Открыть игру».
   *
   * Приглашение уезжает обычным параметром адреса, а не `startapp`: кнопка
   * открывает приложение по прямому адресу, и параметра запуска Telegram
   * там нет вовсе (та же история, что у `InviteNotifierService.appUrl`).
   */
  private async reply(
    telegramId: number,
    invite: string | null,
  ): Promise<void> {
    const url = this.appUrl(invite);
    const text = invite
      ? 'Вас позвали в Библейскую арену. Нажмите кнопку — откроется игра, а тот, кто позвал, окажется у вас в друзьях.'
      : 'Это Библейская арена. Нажмите кнопку, чтобы открыть игру.';

    const result = await this.telegramBot.sendMessage(
      BigInt(telegramId),
      // Без кнопки текст про кнопку выглядит издевательством: адрес сайта
      // не настроен, и открыть отсюда нечего.
      url ? text : 'Это Библейская арена. Откройте игру из меню бота.',
      url ? { label: 'Открыть игру', url } : undefined,
    );

    if (result.status === 'failed') {
      this.logger.warn(`Не удалось ответить на /start: ${result.reason}`);
    }
  }

  /**
   * Нажавший «Старт» разрешил боту писать ему — с этого мгновения и
   * навсегда, пока сам не заблокирует.
   *
   * Пришедшего впервые здесь ещё нет: аккаунт заводится при первом входе в
   * приложение, а туда флаг придёт из `initData`, где после «Старта» он уже
   * стоит. Поэтому «не нашли» — обычное дело, а не ошибка.
   */
  private async markCanWrite(telegramId: number): Promise<void> {
    try {
      await this.prisma.user.updateMany({
        where: { telegramId: BigInt(telegramId), canWriteToPm: false },
        data: { canWriteToPm: true },
      });
    } catch (error) {
      this.logger.warn(`Не удалось отметить разрешение: ${String(error)}`);
    }
  }

  private appUrl(invite: string | null): string | null {
    const configured =
      this.configService.get<string>('WEB_APP_URL') ||
      this.configService.get<string>('CORS_ORIGIN');
    const base = configured?.split(',')[0]?.trim();
    // Telegram открывает в кнопке только https — на локальной машине
    // кнопки не будет.
    if (!base?.startsWith('https://')) return null;

    const root = base.replace(/\/$/, '');
    return invite
      ? `${root}/?invite=${encodeURIComponent(invite)}`
      : `${root}/`;
  }

  /**
   * Куда Telegram приносит входящие.
   *
   * `TELEGRAM_WEBHOOK_URL` — если адрес задан руками. Иначе собирается из
   * `RAILWAY_PUBLIC_DOMAIN`, который Railway подставляет сам: одной
   * переменной, которую надо не забыть, меньше.
   */
  private webhookUrl(): string | null {
    const explicit = (
      this.configService.get<string>('TELEGRAM_WEBHOOK_URL') ?? ''
    ).trim();
    if (explicit) return explicit.replace(/\/$/, '');

    const domain = (
      this.configService.get<string>('RAILWAY_PUBLIC_DOMAIN') ?? ''
    ).trim();
    return domain ? `https://${domain}/${TELEGRAM_WEBHOOK_PATH}` : null;
  }

  private async registerWebhook(): Promise<void> {
    const secret = this.secret;
    const url = this.webhookUrl();
    if (!secret || !url) {
      // Бота нет или адрес неизвестен — не событие: так выглядит и местная
      // машина, и деплой без бота.
      return;
    }

    if (await this.telegramBot.setWebhook(url, secret)) {
      this.logger.log(`Бот слушает входящие: ${url}`);
    }
  }

  private messageOf(update: unknown): TelegramMessage | null {
    if (!update || typeof update !== 'object' || !('message' in update)) {
      return null;
    }
    const message = (update as { message?: unknown }).message;
    return message && typeof message === 'object' ? message : null;
  }
}
