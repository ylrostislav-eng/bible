import type { ConfigService } from '@nestjs/config';
import { TelegramBotService } from './telegram-bot.service';

/**
 * Тест сторожит **одну строку** — `allow_user_chats` и три «нельзя» рядом
 * с ней.
 *
 * Ради неё всё подготовленное сообщение и заведено: без фильтров проще и
 * короче открыть обычный `shareURL`. А заметить пропажу можно только на
 * живом телефоне, открыв экран выбора и увидев там каналы и группы вместо
 * людей — по коду и по ответу Telegram всё выглядит исправным.
 *
 * Второе, что здесь проверяется: ссылка попадает **в текст сообщения**.
 * Приглашение без ссылки доходит до адресата как обычное «давай играть» —
 * отправитель уверен, что позвал, а нажать получателю нечего.
 */
describe('TelegramBotService.prepareInviteMessage', () => {
  interface SavedRequest {
    user_id: string;
    result: { input_message_content: { message_text: string } };
    allow_user_chats: boolean;
    allow_bot_chats: boolean;
    allow_group_chats: boolean;
    allow_channel_chats: boolean;
  }

  function serviceWith(response: {
    ok: boolean;
    body?: unknown;
    status?: number;
  }) {
    const config = {
      get: (key: string) =>
        key === 'TELEGRAM_BOT_TOKEN'
          ? 'stub-token'
          : key === 'TELEGRAM_API_BASE'
            ? 'http://telegram.test'
            : undefined,
    } as unknown as ConfigService;

    const fetchMock = jest.fn(() =>
      Promise.resolve({
        ok: response.ok,
        status: response.status ?? (response.ok ? 200 : 400),
        json: () => Promise.resolve(response.body),
      } as Response),
    );
    global.fetch = fetchMock;

    return { service: new TelegramBotService(config), fetchMock };
  }

  function sentBody(fetchMock: jest.Mock): SavedRequest {
    // Тело у нас всегда строка (сервис сам зовёт `JSON.stringify`), но по
    // типу `RequestInit` это ещё и поток с формой — отсюда явное сужение.
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    return JSON.parse(init.body) as SavedRequest;
  }

  it('разрешает только личные чаты — ни групп, ни каналов, ни ботов', async () => {
    const { service, fetchMock } = serviceWith({
      ok: true,
      body: { ok: true, result: { id: 'prepared-1' } },
    });

    const id = await service.prepareInviteMessage(
      42n,
      'https://t.me/bot/app?startapp=ref_me',
      'Играем вместе',
    );

    expect(id).toBe('prepared-1');
    const body = sentBody(fetchMock);
    expect(body.allow_user_chats).toBe(true);
    expect(body.allow_bot_chats).toBe(false);
    expect(body.allow_group_chats).toBe(false);
    expect(body.allow_channel_chats).toBe(false);
  });

  it('кладёт ссылку в текст сообщения', async () => {
    const { service, fetchMock } = serviceWith({
      ok: true,
      body: { ok: true, result: { id: 'prepared-1' } },
    });

    await service.prepareInviteMessage(
      42n,
      'https://t.me/bot/app?startapp=ref_me',
      'Играем вместе',
    );

    expect(sentBody(fetchMock).result.input_message_content.message_text).toBe(
      'Играем вместе\nhttps://t.me/bot/app?startapp=ref_me',
    );
  });

  it('отказ Telegram отдаёт как null, а не как исключение', async () => {
    // Клиент на `null` откроет обычный `shareURL`. Исключение здесь уронило
    // бы весь экран друзей из-за необязательной кнопки.
    const { service } = serviceWith({
      ok: false,
      status: 400,
      body: { ok: false, description: 'USER_ID_INVALID' },
    });

    await expect(
      service.prepareInviteMessage(42n, 'https://t.me/bot/app', 'текст'),
    ).resolves.toBeNull();
  });

  it('без токена бота никуда не ходит', async () => {
    const config = { get: () => undefined } as unknown as ConfigService;
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    await expect(
      new TelegramBotService(config).prepareInviteMessage(
        42n,
        'https://t.me/bot/app',
        'текст',
      ),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
