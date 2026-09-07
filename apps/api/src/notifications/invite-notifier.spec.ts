import type { ConfigService } from '@nestjs/config';
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
    webAppUrl?: string;
  }

  function serviceWith({
    inviteNotificationsEnabled = true,
    online = false,
    timezoneOffsetMinutes = 0,
    cooldownFree = true,
    sendResult = { status: 'sent' },
    now = NOON_UTC,
    webAppUrl = 'https://arena.example.com',
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

    const configService = {
      get: jest.fn((key: string) =>
        key === 'WEB_APP_URL' ? webAppUrl : undefined,
      ),
    } as unknown as ConfigService;

    return {
      service: new InviteNotifierService(
        prisma,
        presence,
        telegram,
        redisService,
        configService,
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
    const [telegramId, text, openApp] = sendMessage.mock.calls[0] as [
      bigint,
      string,
      { label: string; url: string } | undefined,
    ];
    expect(telegramId).toBe(42n);
    expect(text).toContain('зовущий');

    // Кнопка, а не ссылка в тексте. Ссылка `t.me/<бот>/app?startapp=…`
    // ведёт в Main Mini App, а он существует, только если назначен в
    // BotFather, — без него нажатие молча ничего не делает. _Так и вышло
    // на боевом сервере: сообщение приходило, ссылка нажималась,
    // приложение не открывалось._
    expect(openApp).toEqual({
      label: 'Открыть вызов',
      url: 'https://arena.example.com/?invite=duel_%D0%BF%D0%B0%D1%80%D1%82%D0%B8%D1%8F1',
    });
  });

  it('без настроенного адреса сайта оставляет ссылку в тексте', async () => {
    // Пустая строка, а не `undefined`: значение по умолчанию в
    // деструктуризации подставляется именно на `undefined`, и «не настроен»
    // превратилось бы в «настроен по умолчанию».
    const { service, sendMessage } = serviceWith({ webAppUrl: '' });
    await challenge(service);

    const [, text, openApp] = sendMessage.mock.calls[0] as [
      bigint,
      string,
      unknown,
    ];
    expect(openApp).toBeUndefined();
    expect(text).toContain(
      'https://t.me/bible_arena_bot/app?startapp=duel_партия1',
    );
  });

  it('не делает кнопку из адреса без https — Telegram её не примет', async () => {
    const { service, sendMessage } = serviceWith({
      webAppUrl: 'http://localhost:3000',
    });
    await challenge(service);

    const [, , openApp] = sendMessage.mock.calls[0] as [
      bigint,
      string,
      unknown,
    ];
    expect(openApp).toBeUndefined();
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
      {} as ConfigService,
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

    const [, text, openApp] = sendMessage.mock.calls[0] as [
      bigint,
      string,
      { label: string; url: string },
    ];
    expect(text).toContain('«Вечерняя»');
    expect(openApp.label).toBe('Открыть приглашение');
    expect(decodeURIComponent(openApp.url)).toContain(
      '?invite=room_приглашение1',
    );
  });
});
