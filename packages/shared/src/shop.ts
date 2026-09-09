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

/**
 * Чем товар является для правил: расходник тратится, оформление
 * надевается.
 *
 * Виды с `LAMP_` — детали личной лампы. Разделены по слоям рисунка
 * (пламя, чаша, сияние), а не сложены в одну «лампу целиком», потому что
 * собранная из частей вещь и есть то, ради чего копят: у каждого своя
 * комбинация, а не один из четырёх готовых наборов.
 */
export type ShopItemKind =
  'CONSUMABLE' | 'FRAME' | 'NAME_COLOR' | 'LAMP_FLAME' | 'LAMP_VESSEL' | 'LAMP_GLOW';

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
  | 'color_rose'
  | 'lamp_flame_azure'
  | 'lamp_flame_emerald'
  | 'lamp_flame_violet'
  | 'lamp_flame_white'
  | 'lamp_vessel_clay'
  | 'lamp_vessel_silver'
  | 'lamp_vessel_bronze'
  | 'lamp_vessel_gold'
  | 'lamp_glow_halo'
  | 'lamp_glow_rays'
  | 'lamp_glow_stars';

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

  // --- Своя лампа ---
  //
  // Верхний ярус цен, которого экономике не хватало: рамка за 900 берётся
  // за неделю-полторы, и дальше копить было не для чего. Лампа собирается
  // месяцами, и у каждого получается своя — в этом и смысл разделения по
  // слоям, а не продажи готовых наборов.
  //
  // Цвет пламени — самое заметное и самое дешёвое: с него начинают.
  {
    id: 'lamp_flame_azure',
    kind: 'LAMP_FLAME',
    name: 'Лазурное пламя',
    description: 'Огонь вашей лампы горит холодной синевой.',
    price: 250,
    value: 'azure',
  },
  {
    id: 'lamp_flame_emerald',
    kind: 'LAMP_FLAME',
    name: 'Изумрудное пламя',
    description: 'Зелёный огонь — редкий и заметный издалека.',
    price: 250,
    value: 'emerald',
  },
  {
    id: 'lamp_flame_violet',
    kind: 'LAMP_FLAME',
    name: 'Пурпурное пламя',
    description: 'Тёмно-фиолетовый огонь с розовой сердцевиной.',
    price: 400,
    value: 'violet',
  },
  {
    id: 'lamp_flame_white',
    kind: 'LAMP_FLAME',
    name: 'Белое пламя',
    description: 'Ровный белый свет, почти без цвета. Самое дорогое пламя.',
    price: 1500,
    value: 'white',
  },

  {
    id: 'lamp_vessel_clay',
    kind: 'LAMP_VESSEL',
    name: 'Глиняный сосуд',
    description: 'Простая обожжённая глина — такая, какой она и была.',
    price: 150,
    value: 'clay',
  },
  {
    id: 'lamp_vessel_bronze',
    kind: 'LAMP_VESSEL',
    name: 'Бронзовый сосуд',
    description: 'Тёмная бронза с зеленоватым отливом.',
    price: 350,
    value: 'bronze',
  },
  {
    id: 'lamp_vessel_silver',
    kind: 'LAMP_VESSEL',
    name: 'Серебряный сосуд',
    description: 'Холодное серебро.',
    price: 700,
    value: 'silver',
  },
  {
    id: 'lamp_vessel_gold',
    kind: 'LAMP_VESSEL',
    name: 'Золотой светильник',
    description: 'Чистое золото — как светильник в скинии. Самая дорогая вещь в лавке.',
    price: 3000,
    value: 'gold',
  },

  {
    id: 'lamp_glow_halo',
    kind: 'LAMP_GLOW',
    name: 'Ореол',
    description: 'Мягкое кольцо света вокруг пламени.',
    price: 300,
    value: 'halo',
  },
  {
    id: 'lamp_glow_rays',
    kind: 'LAMP_GLOW',
    name: 'Лучи',
    description: 'Свет расходится лучами во все стороны.',
    price: 800,
    value: 'rays',
  },
  {
    id: 'lamp_glow_stars',
    kind: 'LAMP_GLOW',
    name: 'Искры',
    description: 'Над пламенем поднимаются редкие искры.',
    price: 2000,
    value: 'stars',
  },
];

/** Виды, из которых собирается лампа — в порядке отделов на витрине. */
export const LAMP_KINDS: readonly ShopItemKind[] = ['LAMP_FLAME', 'LAMP_VESSEL', 'LAMP_GLOW'];

export function isLampPart(item: ShopItemDefinition): boolean {
  return LAMP_KINDS.includes(item.kind);
}

/**
 * Как выглядит лампа игрока. Пустые поля — обычная лампа, та же, что была
 * до всякой лавки: ненадетая деталь это не «сломано», а «как у всех».
 */
export interface LampLook {
  flame: string | null;
  vessel: string | null;
  glow: string | null;
}

export const DEFAULT_LAMP_LOOK: LampLook = {
  flame: null,
  vessel: null,
  glow: null,
};

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
