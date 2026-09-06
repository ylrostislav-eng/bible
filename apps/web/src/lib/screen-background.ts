/**
 * Какие обои показывать на каком экране.
 *
 * Отдельный модуль, а не константа внутри компонента, потому что это
 * знание нужно в двух местах сразу: сам фон (`ScreenBackground`) и
 * распорка на коротких экранах (`ScreenSpacer`, которой важно знать,
 * рисовать ли в пустоте лампу). Разъехавшись, эти два списка дали бы
 * лампу поверх картинки — ровно то, чего не должно быть.
 *
 * Сопоставление по началу адреса — тот же приём, что в `modeTheme` и в
 * музыке: у экранов бывают вложенные адреса, и список точных совпадений
 * пришлось бы дополнять при каждом новом экране.
 */

export interface ScreenBackground {
  /** Имя файла в `public/backgrounds` без расширения. */
  file: string;
  /**
   * Плотность затемнения у верхнего края, 0…1.
   *
   * Кадры рисовались по нашему заданию: сюжет в средней полосе, верх и
   * низ тёмные. Но «тёмный» у художника и «достаточно тёмный, чтобы
   * поверх лёг белый заголовок» — разные вещи. Число здесь дешевле
   * переделки картинки.
   */
  topFade: number;
  /**
   * Плотность затемнения в средней полосе, 0…1.
   *
   * Обычно почти прозрачно (`MID_FADE_OPEN`): середина — это и есть
   * сюжет кадра, ради которого всё затевалось, и на экранах-меню там
   * пусто. Но есть экраны, где середина занята текстом прямо на фоне —
   * заголовки разделов, подписи, пунктирные кнопки. На настройке партии
   * Alias подпись «+ Ещё команда» легла ровно на свечу и стала почти
   * невидимой.
   *
   * Первым порывом было притемнить середину у всех — но тогда
   * восемь картинок гаснут ради двух экранов. Второй мыслью было дать
   * подложку каждому такому тексту — но подложка под каждым заголовком
   * раздела превращает экран в лоскутное одеяло. Отсюда число на режим.
   */
  midFade: number;
}

/** Середина открыта: под ней либо пусто, либо непрозрачные карточки. */
const MID_FADE_OPEN = 0.12;
/** Середина занята текстом прямо на фоне — картинку приходится гасить. */
const MID_FADE_BUSY = 0.62;

/** Порядок важен: `/play/duel` должен найтись раньше, чем `/play`. */
const BACKGROUNDS: ({ prefix: string } & ScreenBackground)[] = [
  { prefix: '/play/duel', file: 'duel', topFade: 0.6, midFade: MID_FADE_OPEN },
  { prefix: '/play/room', file: 'room', topFade: 0.6, midFade: MID_FADE_OPEN },
  { prefix: '/play/solo', file: 'solo', topFade: 0.6, midFade: MID_FADE_OPEN },
  { prefix: '/play/alias', file: 'alias', topFade: 0.6, midFade: MID_FADE_BUSY },
  { prefix: '/hot-cold', file: 'hot-cold', topFade: 0.6, midFade: MID_FADE_BUSY },
  { prefix: '/learn', file: 'learn', topFade: 0.6, midFade: MID_FADE_OPEN },
  // Единственный кадр, который затемнён и сверху, и в середине. Столб
  // света упирается в самый верх — туда, где заголовок, — и проходит
  // насквозь через центр экрана, где лежат карточки. Стеклянная карточка
  // над ним теряла контраст: приглушённый текст падал до 3.6:1 при
  // пороге 4.5:1. Одно число здесь дешевле, чем гасить подложку у всех
  // восьми картинок ради одной (см. `.glass-card` в `globals.css`).
  { prefix: '/daily', file: 'daily', topFade: 0.82, midFade: MID_FADE_BUSY },
  { prefix: '/tournaments', file: 'tournaments', topFade: 0.62, midFade: MID_FADE_OPEN },
];

/**
 * Общий фон: главная, профиль, друзья, знания, настройки.
 *
 * Он спокойнее остальных намеренно. Это экраны-списки, на них много
 * мелкого текста, и картинка здесь — подложка, а не сюжет.
 */
const DEFAULT_BACKGROUND: ScreenBackground = {
  file: 'default',
  topFade: 0.5,
  midFade: MID_FADE_OPEN,
};

export function screenBackground(pathname: string | null): ScreenBackground {
  if (!pathname) return DEFAULT_BACKGROUND;
  const match = BACKGROUNDS.find(({ prefix }) => pathname.startsWith(prefix));
  return match ?? DEFAULT_BACKGROUND;
}

/** Адрес файла обоев. В одном месте, чтобы разметка и предзагрузка не
 * разошлись в написании пути. */
export function backgroundUrl(file: string): string {
  return `/backgrounds/${file}.webp`;
}

/** Все обои приложения — для тихой предзагрузки в простое. */
export const ALL_BACKGROUNDS: readonly string[] = [
  DEFAULT_BACKGROUND.file,
  ...BACKGROUNDS.map(({ file }) => file),
];
