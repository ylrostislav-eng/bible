import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PresenceService } from '../presence/presence.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TelegramBotService } from './telegram-bot.service';

/**
 * Часы по местному времени получателя, когда писать можно.
 *
 * Шире, чем у вечерних напоминаний (19–21): там приложение пишет по своей
 * инициативе, а здесь человека зовёт живой человек, и днём это уместно в
 * любой час. Ночью — нет, ни в каком виде.
 */
const QUIET_UNTIL_HOUR = 9;
const QUIET_FROM_HOUR = 23;

/**
 * Пауза между сообщениями одному человеку.
 *
 * Не про спам одного отправителя — от него защищает правило «один
 * невыполненный вызов на пару». Это про пятерых сразу: пять приглашений в
 * одну минуту дают пять уведомлений, и телефон звенит очередью. Первое
 * доходит, остальные ждут в приложении — они всё равно там, попап покажет
 * их все разом.
 */
const NOTIFY_COOLDOWN_SECONDS = 5 * 60;

/**
 * Уведомление вне приложения: «вас зовут в игру».
 *
 * Смысл ровно один — закрыть дыру, из-за которой позвать можно было только
 * того, кто прямо сейчас смотрит в экран. Вызов и так не пропадает (он
 * ждёт в приложении), но узнать о нём было неоткуда, и приглашение
 * незнакомому человеку почти всегда уходило в пустоту.
 *
 * Правила отправки — не украшение, а то, что отделяет полезное сообщение
 * от навязчивого:
 *
 * - **Только если приложение закрыто.** Кто в сети, тот уже видит попап;
 *   дублировать его сообщением — учить человека не обращать внимания.
 * - **Не ночью.** По часовому поясу самого получателя.
 * - **Не чаще раза в пять минут.**
 * - **Никогда, если человек выключил это в настройках** или заблокировал
 *   бота (второе выключает настройку само).
 *
 * Ошибки наружу не выходят: вызов и приглашение состоялись независимо от
 * того, дошло ли сообщение. Поэтому вызывающий делает `void` и не ждёт.
 */
@Injectable()
export class InviteNotifierService {
  private readonly logger = new Logger(InviteNotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly telegram: TelegramBotService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  /** «Такой-то бросает вам вызов». */
  async notifyDuelChallenge(params: {
    toUserId: string;
    fromNickname: string | null;
    sessionId: string;
  }): Promise<void> {
    await this.notify({
      toUserId: params.toUserId,
      invite: `duel_${params.sessionId}`,
      buttonLabel: 'Открыть вызов',
      text: (link) =>
        [
          `${playerLabel(params.fromNickname)} вызывает вас на дуэль.`,
          link ? `Открыть: ${link}` : 'Откройте приложение, чтобы ответить.',
        ].join('\n'),
    });
  }

  /** «Такой-то зовёт вас в комнату». */
  async notifyRoomInvite(params: {
    toUserId: string;
    fromNickname: string | null;
    roomName: string | null;
    inviteId: string;
  }): Promise<void> {
    const room = params.roomName ? ` «${params.roomName}»` : '';
    await this.notify({
      toUserId: params.toUserId,
      invite: `room_${params.inviteId}`,
      buttonLabel: 'Открыть приглашение',
      text: (link) =>
        [
          `${playerLabel(params.fromNickname)} зовёт вас в комнату${room}.`,
          link ? `Открыть: ${link}` : 'Откройте приложение, чтобы ответить.',
        ].join('\n'),
    });
  }

  private async notify({
    toUserId,
    invite,
    buttonLabel,
    text,
  }: {
    toUserId: string;
    invite: string;
    buttonLabel: string;
    text: (link: string | null) => string;
  }): Promise<void> {
    try {
      const recipient = await this.prisma.user.findUnique({
        where: { id: toUserId },
        select: {
          telegramId: true,
          inviteNotificationsEnabled: true,
          timezoneOffsetMinutes: true,
        },
      });
      if (!recipient?.inviteNotificationsEnabled) return;

      const online = await this.presence.areOnline([toUserId]);
      if (online[toUserId]) return;

      if (this.isQuietHour(recipient.timezoneOffsetMinutes)) return;
      if (!(await this.claimCooldown(toUserId))) return;

      // Кнопка — основной способ открыть приглашение, ссылка в тексте —
      // запасной на случай, когда адрес сайта не настроен.
      const appUrl = this.appUrl(invite);
      const result = await this.telegram.sendMessage(
        recipient.telegramId,
        text(appUrl ? null : await this.deepLink(invite)),
        appUrl ? { label: buttonLabel, url: appUrl } : undefined,
      );

      if (result.status === 'blocked') {
        // То же решение, что у напоминаний: 403 от Telegram — это «я не
        // хочу ваших сообщений», и повторять бессмысленно и невежливо.
        await this.prisma.user.update({
          where: { id: toUserId },
          data: { inviteNotificationsEnabled: false },
        });
        this.logger.log(
          `Уведомления о приглашениях выключены для ${toUserId} (бот заблокирован)`,
        );
      } else if (result.status === 'failed') {
        this.logger.warn(
          `Уведомление о приглашении для ${toUserId} не ушло: ${result.reason}`,
        );
      }
    } catch (error) {
      // Молча по отношению к игре: вызов уже создан, и падать из-за
      // недоступного Telegram или Redis он не должен.
      this.logger.warn(
        `Уведомление о приглашении не отправлено: ${String(error)}`,
      );
    }
  }

  /** Ночь по местному времени получателя. Зеркалит `localHour` из
   * напоминаний — там же и объяснение, почему смещение хранится у игрока. */
  private isQuietHour(offsetMinutes: number): boolean {
    const shifted = new Date(Date.now() - offsetMinutes * 60_000);
    const hour = shifted.getUTCHours();
    return hour < QUIET_UNTIL_HOUR || hour >= QUIET_FROM_HOUR;
  }

  /**
   * Занимает паузу под этого получателя: `true` — писать можно.
   *
   * `SET NX EX` вместо «прочитать и записать»: два приглашения в одну
   * миллисекунду иначе оба увидели бы пустоту и оба отправили бы
   * сообщение — ровно то, от чего пауза и заводится.
   *
   * Redis недоступен — разрешаем. Потерять паузу на минуту лучше, чем
   * молча проглотить единственное уведомление за день.
   */
  private async claimCooldown(userId: string): Promise<boolean> {
    try {
      const claimed = await this.redisService.client.set(
        `invite-notify:${userId}`,
        '1',
        'EX',
        NOTIFY_COOLDOWN_SECONDS,
        'NX',
      );
      return claimed === 'OK';
    } catch {
      return true;
    }
  }

  /**
   * Адрес мини-приложения для кнопки под сообщением.
   *
   * Берётся из `WEB_APP_URL`, а если её нет — из `CORS_ORIGIN` (это и есть
   * адрес сайта, просто заведённый для другой цели). Второе — чтобы
   * работало на уже развёрнутом сервере без новой настройки.
   *
   * Приглашение уезжает обычным параметром адреса, а не `startapp`:
   * `startapp` наполняет `tgWebAppStartParam` только при открытии по
   * ссылке `t.me/...`, а кнопка открывает приложение по прямому адресу, и
   * там его просто нет. Клиент читает оба (см. `launch-invite.ts`).
   *
   * `null`, если адрес не настроен, — тогда в сообщении остаётся текстовая
   * ссылка.
   */
  private appUrl(invite: string): string | null {
    const configured =
      this.configService.get<string>('WEB_APP_URL') ||
      this.configService.get<string>('CORS_ORIGIN');
    if (!configured) return null;

    // `CORS_ORIGIN` может перечислять несколько адресов через запятую —
    // для кнопки нужен один, и первый из списка это основной сайт.
    const base = configured.split(',')[0]?.trim();
    if (!base?.startsWith('https://')) {
      // Telegram открывает в кнопке только https. На локальной машине это
      // `http://localhost`, и там кнопки просто не будет — сообщение
      // останется с текстовой ссылкой.
      return null;
    }

    return `${base.replace(/\/$/, '')}/?invite=${encodeURIComponent(invite)}`;
  }

  /**
   * Запасная ссылка через бота — на случай, когда адрес сайта не настроен.
   *
   * Ведёт в Main Mini App, а он существует, только если назначен в
   * BotFather; поэтому основной способ — кнопка выше, а это лишь чтобы
   * человек хотя бы знал, куда идти.
   */
  private async deepLink(startParam: string): Promise<string | null> {
    const botUsername = await this.telegram.getBotUsername();
    return botUsername
      ? `https://t.me/${botUsername}/app?startapp=${startParam}`
      : null;
  }
}

/** Имя в сообщении. Без ника — «Игрок»: пустое место в тексте выглядит
 * поломкой, а имя из Telegram здесь не наше, чтобы его показывать. */
function playerLabel(nickname: string | null): string {
  return nickname ?? 'Игрок';
}
