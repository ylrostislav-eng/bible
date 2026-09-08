import type { ConfigService } from '@nestjs/config';
import { buildInviteLink, inviteLinkOpensApp } from './invite-link';

/**
 * Ссылку-приглашение нельзя проверить «по коду»: все три вида выглядят
 * одинаково правдоподобно, и неправильный не ломается, а молча открывает
 * профиль бота. Поэтому вид ссылки сторожится здесь построчно.
 *
 * Отдельно сторожится то, что второй вид (`t.me/<бот>?startapp=`) не
 * возвращается **никогда**: именно он стоял здесь раньше и не работал,
 * потому что Main Mini App не назначен. Соблазн вернуть его велик — он
 * короче и не требует заводить короткое имя в BotFather.
 */
describe('buildInviteLink', () => {
  function config(shortName?: string): Pick<ConfigService, 'get'> {
    return {
      get: (key: string) =>
        key === 'TELEGRAM_MINI_APP_SHORT_NAME' ? shortName : undefined,
    };
  }

  it('с коротким именем — прямая ссылка на мини-приложение', () => {
    expect(buildInviteLink('bible_bot', 'ТОКЕН', config('play'))).toBe(
      'https://t.me/bible_bot/play?startapp=ref_ТОКЕН',
    );
  });

  it('без короткого имени — честный переход в бота, а не мнимый в игру', () => {
    const link = buildInviteLink('bible_bot', 'ТОКЕН', config());

    expect(link).toBe('https://t.me/bible_bot?start=ref_ТОКЕН');
    // Не `?startapp=`: он открывает профиль бота и на этом всё кончается.
    expect(link).not.toContain('startapp');
  });

  it('пустое и пробельное короткое имя считаются незаданными', () => {
    // Переменную окружения ставят пустой чаще, чем удаляют.
    for (const value of ['', '   ']) {
      expect(buildInviteLink('bible_bot', 'Т', config(value))).toContain(
        '?start=ref_',
      );
      expect(inviteLinkOpensApp(config(value))).toBe(false);
    }
  });

  it('сохраняет префикс `ref_` — по нему приглашение и узнаётся', () => {
    // `AuthService.parseInviteParam` ищет ровно `ref_<токен>`; ссылка без
    // префикса выглядит рабочей и не связывает никого.
    expect(buildInviteLink('b', 'abc', config('play'))).toContain(
      'startapp=ref_abc',
    );
  });

  it('признак «откроется игра» совпадает с тем, какая ссылка построена', () => {
    expect(inviteLinkOpensApp(config('play'))).toBe(true);
    expect(inviteLinkOpensApp(config())).toBe(false);
  });
});
