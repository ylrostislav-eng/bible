import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import type { TelegramBotService } from './telegram-bot.service';
import { TelegramUpdatesService } from './telegram-updates.service';

/**
 * Вебхук бота — единственный вход в приложение без токена, и проверить его
 * «по коду» нельзя: и дыра в проверке секрета, и потерянное приглашение
 * выглядят как работающий бот. Он отвечает, кнопка есть, всё хорошо — а
 * пришедший по ссылке не попадает в друзья к позвавшему, и никто этого не
 * замечает, потому что жаловаться не на что.
 *
 * Поэтому здесь сторожатся ровно два правила: чужого не пускать и
 * приглашение из `/start` донести до кнопки.
 */
describe('TelegramUpdatesService', () => {
  const BOT_TOKEN = '123:секрет-бота';

  function make(overrides: Record<string, string | undefined> = {}) {
    const env: Record<string, string | undefined> = {
      TELEGRAM_BOT_TOKEN: BOT_TOKEN,
      WEB_APP_URL: 'https://игра.example',
      ...overrides,
    };
    const sendMessage = jest.fn().mockResolvedValue({ status: 'sent' });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });

    const service = new TelegramUpdatesService(
      { get: (key: string) => env[key] } as unknown as ConfigService,
      { sendMessage } as unknown as TelegramBotService,
      { user: { updateMany } } as unknown as PrismaService,
    );
    return { service, sendMessage, updateMany };
  }

  function startMessage(text: string, chatType = 'private') {
    return { message: { text, from: { id: 42 }, chat: { type: chatType } } };
  }

  describe('секрет доставки', () => {
    it('не пускает чужого: пустой, неверный и отсутствующий секрет', () => {
      const { service } = make();

      expect(service.verifySecret(undefined)).toBe(false);
      expect(service.verifySecret('')).toBe(false);
      expect(service.verifySecret('не тот секрет')).toBe(false);
      // Длина другая — сравнение не должно падать на `timingSafeEqual`,
      // который требует одинаковых буферов.
      expect(service.verifySecret('к')).toBe(false);
    });

    it('пускает свой', () => {
      const { service } = make();

      expect(service.verifySecret(service.secret ?? '')).toBe(true);
    });

    it('без токена бота не пускает никого — даже с пустым заголовком', () => {
      const { service } = make({ TELEGRAM_BOT_TOKEN: undefined });

      expect(service.secret).toBeNull();
      expect(service.verifySecret('')).toBe(false);
      expect(service.verifySecret('что угодно')).toBe(false);
    });

    it('секрет выводится из токена: у другого бота он другой', () => {
      // Иначе секрет одинаков у всех, кто читал этот код.
      expect(make().service.secret).not.toBe(
        make({ TELEGRAM_BOT_TOKEN: '999:другой' }).service.secret,
      );
    });

    it('заданный руками секрет побеждает выведенный', () => {
      const { service } = make({ TELEGRAM_WEBHOOK_SECRET: 'вручную' });

      expect(service.secret).toBe('вручную');
    });
  });

  describe('/start', () => {
    it('доносит приглашение из ссылки до кнопки', async () => {
      const { service, sendMessage } = make();
      const token = 'a'.repeat(32);

      await service.handleUpdate(startMessage(`/start ref_${token}`));

      const [chatId, , openApp] = sendMessage.mock.calls[0] as [
        bigint,
        string,
        { label: string; url: string },
      ];
      expect(chatId).toBe(42n);
      expect(openApp.url).toBe(`https://игра.example/?invite=ref_${token}`);
    });

    it('без приглашения открывает игру, а не тупик', async () => {
      const { service, sendMessage } = make();

      await service.handleUpdate(startMessage('/start'));

      const [, , openApp] = sendMessage.mock.calls[0] as [
        bigint,
        string,
        { url: string },
      ];
      expect(openApp.url).toBe('https://игра.example/');
    });

    it('мусор вместо токена не попадает в адрес', async () => {
      const { service, sendMessage } = make();

      await service.handleUpdate(startMessage('/start ref_../../ой'));

      const [, , openApp] = sendMessage.mock.calls[0] as [
        bigint,
        string,
        { url: string },
      ];
      expect(openApp.url).toBe('https://игра.example/');
    });

    it('отмечает, что боту теперь можно писать', async () => {
      const { service, updateMany } = make();

      await service.handleUpdate(startMessage('/start'));

      expect(updateMany).toHaveBeenCalledWith({
        where: { telegramId: 42n, canWriteToPm: false },
        data: { canWriteToPm: true },
      });
    });

    it('на любое другое сообщение тоже отвечает кнопкой', async () => {
      // Человек пишет боту, потому что ищет вход в игру. Молчание здесь —
      // тот же тупик, ради которого всё и затевалось.
      const { service, sendMessage } = make();

      await service.handleUpdate(startMessage('привет'));

      expect(sendMessage).toHaveBeenCalledTimes(1);
    });

    it('в группе молчит', async () => {
      const { service, sendMessage, updateMany } = make();

      await service.handleUpdate(startMessage('/start', 'supergroup'));

      expect(sendMessage).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('переживает доставку без сообщения и без отправителя', async () => {
      const { service, sendMessage } = make();

      await expect(service.handleUpdate({})).resolves.toBeUndefined();
      await expect(service.handleUpdate(null)).resolves.toBeUndefined();
      await expect(
        service.handleUpdate({ message: { text: '/start' } }),
      ).resolves.toBeUndefined();
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('без https-адреса сайта отвечает без кнопки, а не ссылкой в никуда', async () => {
      const { service, sendMessage } = make({
        WEB_APP_URL: 'http://localhost:3000',
      });

      await service.handleUpdate(startMessage('/start'));

      const [, , openApp] = sendMessage.mock.calls[0] as [
        bigint,
        string,
        unknown,
      ];
      expect(openApp).toBeUndefined();
    });
  });
});
