import { isAllowedAvatarUrl } from './avatar-url';

/**
 * Сторожит запрет на чужие адреса в аватаре.
 *
 * Поле принимало любой `https`-адрес, а показывается аватар всем игрокам —
 * в списке лидеров, в друзьях, в чате. То есть ссылка на свой сервер в
 * аватаре собирала IP-адреса, время захода и устройство каждого, кто этот
 * экран открыл, ничего при этом не показывая: достаточно прозрачного
 * пикселя. Проверка домена — единственное, что это закрывает.
 */
describe('isAllowedAvatarUrl', () => {
  it('пропускает адреса Telegram и их поддомены', () => {
    expect(isAllowedAvatarUrl('https://t.me/i/userpic/320/abc.jpg')).toBe(true);
    expect(isAllowedAvatarUrl('https://cdn4.telegram-cdn.org/file/x.jpg')).toBe(
      true,
    );
    expect(isAllowedAvatarUrl('https://telesco.pe/file/y.jpg')).toBe(true);
  });

  it('отклоняет чужой сервер — это и есть сбор чужих IP', () => {
    expect(isAllowedAvatarUrl('https://tracker.example.com/pixel.png')).toBe(
      false,
    );
  });

  it('не даёт обмануть себя похожим именем домена', () => {
    // Проверка идёт по точке-разделителю, иначе `endsWith` пропустил бы
    // домен, который просто заканчивается на нужные буквы.
    expect(isAllowedAvatarUrl('https://nottelegram.org/x.png')).toBe(false);
    expect(isAllowedAvatarUrl('https://telegram.org.evil.com/x.png')).toBe(
      false,
    );
    // И поддомен настоящего домена — наоборот, пропускается.
    expect(isAllowedAvatarUrl('https://a.b.telegram.org/x.png')).toBe(true);
  });

  it('отклоняет не-https и мусор', () => {
    expect(isAllowedAvatarUrl('http://t.me/x.png')).toBe(false);
    expect(isAllowedAvatarUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedAvatarUrl('не ссылка')).toBe(false);
  });

  it('разрешает пустое значение — это способ убрать аватар', () => {
    expect(isAllowedAvatarUrl(null)).toBe(true);
    expect(isAllowedAvatarUrl(undefined)).toBe(true);
  });
});
