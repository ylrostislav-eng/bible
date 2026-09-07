import { InviteNotifierService } from './invite-notifier.service';
import type { PresenceService } from '../presence/presence.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { TelegramBotService } from './telegram-bot.service';

/**
 * Правила отправки — вся ценность этого сервиса. Само сообщение отправить
 * несложно; трудность в том, чтобы не отправить, когда не надо, а таких
 * случаев больше, чем случаев отправки.
 *
 * Проверяется каждое условие по отдельности: в жизни они складываются, и
 * сломанное правило легко спрятать за исправным.
 */
describe('InviteNotifierService — когда писать, а когда молчать', () => {
  /** Полдень по местному времени получателя — «не ночь» для всех проверок,
   * где ночь не проверяется. Часовой пояс держим нулевым, а «сейчас»
   * задаём поддельными часами. */
  const NOON_UTC = new Date('2026-09-07T12:00:00Z');

  interface Stubs {
    inviteNotificationsEnabled?: boolean;
    online?: boolean;
    timezoneOffsetMinutes?: number;
    cooldownFree?: boolean;
    sendResult?: {
      status: 'sent' | 'blocked' | 'failed' | 'disabled';
      reason?: string;
    };
    now?: Date;
  }

  function serviceWith({
    inviteNotificationsEnabled = true,
    online = false,
    timezoneOffsetMinutes = 0,
    cooldownFree = true,
    sendResult = { status: 'sent' },
    now = NOON_UTC,
  }: Stubs) {
    jest.useFakeTimers().setSystemTime(now);

    const userUpdate = jest.fn().mockResolvedValue({});
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          telegramId: 42n,
          inviteNotificationsEnabled,
          timezoneOffsetMinutes,
        }),
        update: userUpdate,
      },
    } as unknown as PrismaService;

    const presence = {
      areOnline: jest.fn().mockResolvedValue({ кому: online }),
    } as unknown as PresenceService;

    const sendMessage = jest.fn().mockResolvedValue(sendResult);
    const telegram = {
      sendMessage,
      getBotUsername: jest.fn().mockResolvedValue('bible_arena_bot'),
    } as unknown as TelegramBotService;

    const redisService = {
      client: {
        set: jest.fn().mockResolvedValue(cooldownFree ? 'OK' : null),
      },
    } as unknown as RedisService;

    return {
      service: new InviteNotifierService(
        prisma,
        presence,
        telegram,
        redisService,
      ),
      sendMessage,
      userUpdate,
    };
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  const challenge = (service: InviteNotifierService) =>
    service.notifyDuelChallenge({
      toUserId: 'кому',
      fromNickname: 'зовущий',
      sessionId: 'партия1',
    });

  it('пишет, когда человек не в сети и всё разрешено', async () => {
    const { service, sendMessage } = serviceWith({});
    await challenge(service);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [telegramId, text] = sendMessage.mock.calls[0] as [bigint, string];
    expect(telegramId).toBe(42n);
    expect(text).toContain('зовущий');
    // Ссылка ведёт внутрь приложения, а не на страницу бота: иначе тап по
    // уведомлению открывает переписку, а не приглашение.
    expect(text).toContain(
      'https://t.me/bible_arena_bot/app?startapp=duel_партия1',
    );
  });

  it('молчит, если человек в сети — он и так видит попап', async () => {
    const { service, sendMessage } = serviceWith({ online: true });
    await challenge(service);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('молчит, если уведомления выключены в настройках', async () => {
    const { service, sendMessage } = serviceWith({
      inviteNotificationsEnabled: false,
    });
    await challenge(service);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('молчит ночью по местному времени получателя', async () => {
    // Полдень UTC, но игрок на +11 — у него уже 23:00.
    const { service, sendMessage } = serviceWith({
      timezoneOffsetMinutes: 11 * 60,
    });
    await challenge(service);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('пишет днём тому же игроку в том же поясе', async () => {
    // +11 и 3 часа UTC — у него 14:00.
    const { service, sendMessage } = serviceWith({
      timezoneOffsetMinutes: 11 * 60,
      now: new Date('2026-09-07T03:00:00Z'),
    });
    await challenge(service);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('молчит, пока не прошла пауза после прошлого уведомления', async () => {
    const { service, sendMessage } = serviceWith({ cooldownFree: false });
    await challenge(service);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('выключает уведомления, если бот заблокирован', async () => {
    const { service, userUpdate } = serviceWith({
      sendResult: { status: 'blocked' },
    });
    await challenge(service);

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'кому' },
      data: { inviteNotificationsEnabled: false },
    });
  });

  it('не выключает уведомления из-за обычного сбоя отправки', async () => {
    const { service, userUpdate } = serviceWith({
      sendResult: { status: 'failed', reason: 'HTTP 500' },
    });
    await challenge(service);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('не роняет вызывающего, если Telegram упал', async () => {
    const { service } = serviceWith({});
    // Подменяем отправку на бросающую: вызов на дуэль уже создан, и
    // исключение отсюда откатило бы игру из-за сообщения.
    const broken = new InviteNotifierService(
      {
        user: {
          findUnique: jest.fn().mockRejectedValue(new Error('база отвалилась')),
        },
      } as unknown as PrismaService,
      {} as PresenceService,
      {} as TelegramBotService,
      {} as RedisService,
    );

    await expect(challenge(broken)).resolves.toBeUndefined();
    expect(service).toBeDefined();
  });

  it('в приглашении в комнату называет комнату', async () => {
    const { service, sendMessage } = serviceWith({});
    await service.notifyRoomInvite({
      toUserId: 'кому',
      fromNickname: 'лидер',
      roomName: 'Вечерняя',
      inviteId: 'приглашение1',
    });

    const [, text] = sendMessage.mock.calls[0] as [bigint, string];
    expect(text).toContain('«Вечерняя»');
    expect(text).toContain('startapp=room_приглашение1');
  });
});
