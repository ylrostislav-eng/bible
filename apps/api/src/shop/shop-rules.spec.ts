import { BadRequestException } from '@nestjs/common';
import {
  SHOP_ALREADY_OWNED_MESSAGE,
  SHOP_NOT_ENOUGH_COINS_MESSAGE,
  SHOP_NOT_OWNED_MESSAGE,
  SHOP_STOCK_FULL_MESSAGE,
  SHOP_UNKNOWN_ITEM_MESSAGE,
  shopItem,
} from '@bible-arena/shared';
import type { PrismaService } from '../prisma/prisma.service';
import { ShopService } from './shop.service';

/**
 * Правила лавки. Набор написан до живой проверки — по тому, как лавка
 * должна себя вести, а не по тому, как повела.
 *
 * Проверяется в первую очередь то, что стоит игроку денег: списание,
 * которое обошло проверку баланса, и покупка, засчитанная дважды.
 */
describe('ShopService — правила покупки', () => {
  /**
   * Заглушка базы, где `updateMany` ведёт себя как настоящий: обновляет
   * строку, только если условие по монетам выполнено. Без этого тест
   * проверял бы вызов, а не правило.
   */
  function shopWith(state: {
    coins: number;
    streakFreezes?: number;
    dailyWordRetries?: number;
    owned?: string[];
    avatarFrame?: string | null;
    nameColor?: string | null;
  }) {
    const user = {
      coins: state.coins,
      streakFreezes: state.streakFreezes ?? 0,
      dailyWordRetries: state.dailyWordRetries ?? 0,
      avatarFrame: state.avatarFrame ?? null,
      nameColor: state.nameColor ?? null,
    };
    const purchases = [...(state.owned ?? [])];

    const updateMany = jest.fn(
      ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const need = (where.coins as { gte?: number } | undefined)?.gte;
        if (need !== undefined && user.coins < need)
          return Promise.resolve({ count: 0 });
        const price = (data.coins as { decrement?: number } | undefined)
          ?.decrement;
        if (price !== undefined) user.coins -= price;
        for (const field of ['streakFreezes', 'dailyWordRetries'] as const) {
          const change = data[field] as
            { increment?: number; decrement?: number } | undefined;
          if (change?.increment) user[field] += change.increment;
          if (change?.decrement) {
            const floor = (where[field] as { gt?: number } | undefined)?.gt;
            if (floor !== undefined && user[field] <= floor)
              return Promise.resolve({ count: 0 });
            user[field] -= change.decrement;
          }
        }
        return Promise.resolve({ count: 1 });
      },
    );

    const create = jest.fn(({ data }: { data: { itemId: string } }) => {
      purchases.push(data.itemId);
      return Promise.resolve({ id: 'p1' });
    });

    const db = {
      user: {
        updateMany,
        update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          Object.assign(user, data);
          return Promise.resolve(user);
        }),
        findUniqueOrThrow: jest.fn(() => Promise.resolve({ ...user })),
      },
      shopPurchase: {
        create,
        findFirst: jest.fn(({ where }: { where: { itemId: string } }) =>
          Promise.resolve(
            purchases.includes(where.itemId) ? { id: 'p1' } : null,
          ),
        ),
        findMany: jest.fn(() =>
          Promise.resolve(
            [...new Set(purchases)].map((itemId) => ({ itemId })),
          ),
        ),
      },
    };

    const prisma = {
      ...db,
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    } as unknown as PrismaService;

    return {
      shop: new ShopService(prisma),
      user,
      purchases,
      updateMany,
      create,
    };
  }

  it('расходник ложится в запас, монеты списываются', async () => {
    const price = shopItem('streak_freeze')!.price;
    const { shop, user, purchases } = shopWith({ coins: price + 5 });

    await shop.buy('игрок', 'streak_freeze');

    expect(user.coins).toBe(5);
    expect(user.streakFreezes).toBe(1);
    // Журнал — единственное, чем потом отвечать на «я покупал, а его нет».
    expect(purchases).toEqual(['streak_freeze']);
  });

  it('без монет не продаёт и ничего не выдаёт', async () => {
    const price = shopItem('streak_freeze')!.price;
    const { shop, user, purchases } = shopWith({ coins: price - 1 });

    await expect(shop.buy('игрок', 'streak_freeze')).rejects.toThrow(
      SHOP_NOT_ENOUGH_COINS_MESSAGE,
    );
    expect(user.coins).toBe(price - 1);
    expect(user.streakFreezes).toBe(0);
    expect(purchases).toEqual([]);
  });

  it('второе нажатие на последние монеты уходит в отказ, а не в долг', async () => {
    // Ровно на одну покупку. Две подряд — обычное дело на медленной сети,
    // и раздельные «прочитал баланс» и «списал» отдали бы оба товара.
    const price = shopItem('streak_freeze')!.price;
    const { shop, user } = shopWith({ coins: price });

    await shop.buy('игрок', 'streak_freeze');
    await expect(shop.buy('игрок', 'streak_freeze')).rejects.toThrow(
      SHOP_NOT_ENOUGH_COINS_MESSAGE,
    );

    expect(user.coins).toBe(0);
    expect(user.streakFreezes).toBe(1);
  });

  it('оформление второй раз не продаётся', async () => {
    const price = shopItem('frame_flame')!.price;
    const { shop, user } = shopWith({
      coins: price * 3,
      owned: ['frame_flame'],
    });

    await expect(shop.buy('игрок', 'frame_flame')).rejects.toThrow(
      SHOP_ALREADY_OWNED_MESSAGE,
    );
    expect(user.coins).toBe(price * 3);
  });

  it('запас расходника не растёт выше предела', async () => {
    const item = shopItem('streak_freeze')!;
    const { shop, user } = shopWith({
      coins: item.price * 2,
      streakFreezes: item.maxStock,
    });

    await expect(shop.buy('игрок', 'streak_freeze')).rejects.toThrow(
      SHOP_STOCK_FULL_MESSAGE,
    );
    expect(user.coins).toBe(item.price * 2);
  });

  it('несуществующий товар отвергается до всякого списания', async () => {
    const { shop, user } = shopWith({ coins: 1000 });

    await expect(shop.buy('игрок', 'frame_of_gold_and_lies')).rejects.toThrow(
      SHOP_UNKNOWN_ITEM_MESSAGE,
    );
    expect(user.coins).toBe(1000);
  });

  it('надеть можно только купленное', async () => {
    const { shop } = shopWith({ coins: 5000 });

    await expect(shop.equip('игрок', 'frame_laurel')).rejects.toThrow(
      SHOP_NOT_OWNED_MESSAGE,
    );
  });

  it('купленное надевается и снимается', async () => {
    const { shop, user } = shopWith({ coins: 0, owned: ['frame_laurel'] });

    await shop.equip('игрок', 'frame_laurel');
    expect(user.avatarFrame).toBe(shopItem('frame_laurel')!.value);

    // Покупка, от которой нельзя отказаться, — ловушка, а не украшение.
    await shop.equip('игрок', null);
    expect(user.avatarFrame).toBeNull();
  });

  it('расходник тратится и не уходит в минус', async () => {
    const { shop, user } = shopWith({ coins: 0, streakFreezes: 1 });

    await expect(shop.consume('игрок', 'streak_freeze')).resolves.toBe(true);
    expect(user.streakFreezes).toBe(0);

    await expect(shop.consume('игрок', 'streak_freeze')).resolves.toBe(false);
    expect(user.streakFreezes).toBe(0);
  });

  it('витрина показывает запас, купленное и надетое', async () => {
    const { shop } = shopWith({
      coins: 300,
      streakFreezes: 2,
      owned: ['frame_flame'],
      avatarFrame: shopItem('frame_flame')!.value,
    });

    const view = await shop.view('игрок');
    const byId = new Map(view.items.map((item) => [item.id, item]));

    expect(view.coins).toBe(300);
    expect(byId.get('streak_freeze')?.stock).toBe(2);
    expect(byId.get('frame_flame')).toMatchObject({
      owned: true,
      equipped: true,
    });
    expect(byId.get('frame_laurel')).toMatchObject({
      owned: false,
      equipped: false,
    });
  });

  it('ошибки лавки — понятные, а не «Bad Request»', async () => {
    const { shop } = shopWith({ coins: 0 });

    await expect(shop.buy('игрок', 'streak_freeze')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
