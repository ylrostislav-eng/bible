/**
 * Лавка: единственное место, где монеты уходят обратно.
 *
 * До неё монеты копились и ничего не значили — валюта без стока это просто
 * ещё одно число рядом с опытом. Отсюда два отдела, и они закрывают разные
 * дыры:
 *
 * **Расходники** тратятся снова и снова, и только они держат монетам цену.
 * Одна косметика этого не умеет: через месяц всё скуплено, и мы возвращаемся
 * ровно туда, откуда ушли.
 *
 * **Оформление** покупается один раз, зато его видно другим — в рейтинге, у
 * игроков, в лобби. Ради него копят; ради расходников возвращаются.
 *
 * Каталог живёт здесь, а не в базе: товары — это правила игры, а не данные.
 * Цена в коде видна в обзоре изменений, переживает восстановление базы и не
 * может разъехаться между сервером и экраном.
 */

/** Чем товар является для правил: расходник тратится, оформление надевается. */
export type ShopItemKind = 'CONSUMABLE' | 'FRAME' | 'NAME_COLOR';

export type ShopItemId =
  | 'streak_freeze'
  | 'daily_word_retry'
  | 'frame_flame'
  | 'frame_laurel'
  | 'frame_scroll'
  | 'frame_dawn'
  | 'color_olive'
  | 'color_sea'
  | 'color_purple'
  | 'color_rose';

export interface ShopItemDefinition {
  id: ShopItemId;
  kind: ShopItemKind;
  name: string;
  /** Что именно это даёт — человеческими словами, до покупки. */
  description: string;
  price: number;
  /**
   * Только для расходников: сколько штук можно держать про запас.
   *
   * Предел не жадность, а смысл: сотня заморозок означает, что серия не
   * прервётся уже никогда, а серия, которую нельзя потерять, ничего не
   * измеряет.
   */
  maxStock?: number;
  /**
   * Только для оформления: как это выглядит. Для цвета — сам цвет, для
   * рамки — ключ рисунка, который знает экран.
   *
   * Цвета подобраны под тёмный фон приложения и проверены на нём: светлее
   * — сливаются с янтарём интерфейса, темнее — не читаются в списке.
   */
  value?: string;
}

/** Сколько дней пропуска закрывает одна заморозка. */
export const STREAK_FREEZE_DAYS = 1;

export const SHOP_ITEMS: readonly ShopItemDefinition[] = [
  // --- Расходники ---
  {
    id: 'streak_freeze',
    kind: 'CONSUMABLE',
    name: 'Хранитель серии',
    description: 'Пропущенный день не оборвёт серию: хранитель истратится сам, когда вы вернётесь.',
    price: 60,
    maxStock: 3,
  },
  {
    id: 'daily_word_retry',
    kind: 'CONSUMABLE',
    name: 'Вторая попытка',
    // Дороже, чем даёт угаданное слово, и это намеренно: покупается ради
    // того, чтобы день не пропал, а не ради заработка. Стоила бы дешевле
    // награды — превратилась бы в способ печатать монеты из монет.
    description: 'Ещё две попытки на «Слово дня», если сегодняшнее не поддалось.',
    price: 25,
    maxStock: 3,
  },

  // --- Оформление: рамки ---
  // Цена растёт не за красоту, а за редкость: смысл дорогой рамки в том,
  // что она встречается редко. Дешёвая, но заметная обесценила бы и себя,
  // и все, что выше неё.
  {
    id: 'frame_flame',
    kind: 'FRAME',
    name: 'Пламя',
    description: 'Тёплое кольцо вокруг вашего значка — как у лампы на главной.',
    price: 150,
    value: 'flame',
  },
  {
    id: 'frame_laurel',
    kind: 'FRAME',
    name: 'Лавр',
    description: 'Венок вокруг значка. Виден всем, кто встретит вас в списках.',
    price: 250,
    value: 'laurel',
  },
  {
    id: 'frame_scroll',
    kind: 'FRAME',
    name: 'Свиток',
    description: 'Кольцо из развёрнутого свитка.',
    price: 400,
    value: 'scroll',
  },
  {
    id: 'frame_dawn',
    kind: 'FRAME',
    name: 'Рассвет',
    description: 'Переливающееся кольцо. Самое редкое из того, что есть в лавке.',
    price: 900,
    value: 'dawn',
  },

  // --- Оформление: цвет имени ---
  {
    id: 'color_olive',
    kind: 'NAME_COLOR',
    name: 'Олива',
    description: 'Имя цвета оливковой ветви.',
    price: 120,
    value: '#8fbf6a',
  },
  {
    id: 'color_sea',
    kind: 'NAME_COLOR',
    name: 'Море',
    description: 'Имя цвета воды у берега.',
    price: 120,
    value: '#5fb6c9',
  },
  {
    id: 'color_purple',
    kind: 'NAME_COLOR',
    name: 'Порфира',
    description: 'Царский пурпур — редкая краска, дорогая и в древности.',
    price: 300,
    value: '#b07ad6',
  },
  {
    id: 'color_rose',
    kind: 'NAME_COLOR',
    name: 'Заря',
    description: 'Розовый отсвет утреннего неба.',
    price: 300,
    value: '#e08aa0',
  },
];

export function shopItem(id: string): ShopItemDefinition | undefined {
  return SHOP_ITEMS.find((item) => item.id === id);
}

/** Оформление покупается навсегда, расходник — сколько угодно раз. */
export function isCosmetic(item: ShopItemDefinition): boolean {
  return item.kind !== 'CONSUMABLE';
}

/** Что экран знает о товаре сверх каталога — своё у каждого игрока. */
export interface ShopItemState {
  id: ShopItemId;
  /** Оформление: куплено ли. У расходников всегда false. */
  owned: boolean;
  /** Оформление: надето ли прямо сейчас. */
  equipped: boolean;
  /** Расходник: сколько лежит про запас. У оформления всегда 0. */
  stock: number;
}

export interface ShopView {
  coins: number;
  items: ShopItemState[];
}

export interface BuyShopItemInput {
  itemId: string;
}

/**
 * Надеть или снять оформление. `itemId: null` — снять всё этого вида и
 * вернуться к обычному виду; без этого купленную рамку нельзя было бы
 * убрать, а покупка, от которой не отказаться, — ловушка, а не украшение.
 */
export interface EquipShopItemInput {
  itemId: string | null;
}

/** Ответ на покупку: остаток монет виден сразу, без второго запроса. */
export interface ShopActionResult {
  coins: number;
  items: ShopItemState[];
}

/** Как игрок выглядит для остальных. Собирается на сервере — рядом с тем
 * местом, где имя проходит проверку на скрытие. */
export interface PlayerLook {
  /** Ключ рамки (`value` товара вида FRAME) или null. */
  frame: string | null;
  /** Цвет имени (`value` товара вида NAME_COLOR) или null. */
  nameColor: string | null;
}

export const SHOP_UNKNOWN_ITEM_MESSAGE = 'Такого товара нет в лавке';
export const SHOP_NOT_ENOUGH_COINS_MESSAGE = 'Не хватает монет';
export const SHOP_ALREADY_OWNED_MESSAGE = 'Это у вас уже есть';
export const SHOP_STOCK_FULL_MESSAGE = 'Больше про запас держать нельзя — сначала израсходуйте';
export const SHOP_NOT_OWNED_MESSAGE = 'Сначала это нужно купить';
