import { BadRequestException, Injectable } from '@nestjs/common';
import {
  SHOP_ALREADY_OWNED_MESSAGE,
  SHOP_ITEMS,
  SHOP_NOT_ENOUGH_COINS_MESSAGE,
  SHOP_NOT_OWNED_MESSAGE,
  SHOP_STOCK_FULL_MESSAGE,
  SHOP_UNKNOWN_ITEM_MESSAGE,
  isCosmetic,
  shopItem,
  type ShopActionResult,
  type ShopItemDefinition,
  type ShopItemId,
  type ShopItemState,
  type ShopView,
} from '@bible-arena/shared';
import { PrismaService } from '../prisma/prisma.service';

/** Что нужно знать о владельце, чтобы собрать витрину. */
type ShopOwner = {
  coins: number;
  streakFreezes: number;
  dailyWordRetries: number;
  avatarFrame: string | null;
  nameColor: string | null;
};

@Injectable()
export class ShopService {
  constructor(private readonly prisma: PrismaService) {}

  async view(userId: string): Promise<ShopView> {
    const [owner, owned] = await Promise.all([
      this.owner(userId),
      this.ownedCosmetics(userId),
    ]);
    return { coins: owner.coins, items: this.states(owner, owned) };
  }

  /**
   * Покупка. Списание и выдача — одна операция с проверкой цены внутри
   * условия, а не «прочитал баланс, подумал, записал».
   *
   * Два нажатия подряд с медленной сетью — обычное дело, и раздельные
   * чтение и запись отдают оба товара за одни деньги. В этом проекте на
   * тех же граблях уже стояли награды за партию и достижения; здесь
   * ошибка стоила бы монет, которых у игрока нет.
   */
  async buy(userId: string, itemId: string): Promise<ShopActionResult> {
    const item = shopItem(itemId);
    if (!item) throw new BadRequestException(SHOP_UNKNOWN_ITEM_MESSAGE);

    await this.prisma.$transaction(async (tx) => {
      // Проверки «уже есть» и «запас полон» идут внутри транзакции: за
      // время между чтением и списанием второй запрос успевает купить то
      // же самое.
      if (isCosmetic(item)) {
        const already = await tx.shopPurchase.findFirst({
          where: { userId, itemId: item.id },
          select: { id: true },
        });
        if (already) throw new BadRequestException(SHOP_ALREADY_OWNED_MESSAGE);
      } else {
        const stock = await this.stockOf(tx, userId, item.id);
        if (item.maxStock !== undefined && stock >= item.maxStock) {
          throw new BadRequestException(SHOP_STOCK_FULL_MESSAGE);
        }
      }

      // Условие `coins: { gte: price }` — то самое место, где покупка
      // становится атомарной: проигравший гонку запрос обновит ноль строк
      // и получит честный отказ вместо второго товара в долг.
      const paid = await tx.user.updateMany({
        where: { id: userId, coins: { gte: item.price } },
        data: {
          coins: { decrement: item.price },
          ...this.grantOf(item),
        },
      });
      if (paid.count === 0) {
        throw new BadRequestException(SHOP_NOT_ENOUGH_COINS_MESSAGE);
      }

      await tx.shopPurchase.create({
        data: { userId, itemId: item.id, price: item.price },
      });
    });

    return this.result(userId);
  }

  /**
   * Надеть купленное оформление или снять его (`itemId: null`).
   *
   * Снятие — не мелочь: покупка, от которой нельзя отказаться, перестаёт
   * быть украшением и становится ловушкой. Поэтому «обычный вид» —
   * такое же законное состояние, как любая купленная рамка.
   */
  async equip(
    userId: string,
    itemId: string | null,
  ): Promise<ShopActionResult> {
    if (itemId === null) {
      // Без вида товара непонятно, что именно снимать, поэтому снимаем всё
      // оформление разом: это ровно то, что значит «вернуть обычный вид».
      await this.prisma.user.update({
        where: { id: userId },
        data: { avatarFrame: null, nameColor: null },
      });
      return this.result(userId);
    }

    const item = shopItem(itemId);
    if (!item || !isCosmetic(item)) {
      throw new BadRequestException(SHOP_UNKNOWN_ITEM_MESSAGE);
    }

    const owned = await this.prisma.shopPurchase.findFirst({
      where: { userId, itemId: item.id },
      select: { id: true },
    });
    if (!owned) throw new BadRequestException(SHOP_NOT_OWNED_MESSAGE);

    await this.prisma.user.update({
      where: { id: userId },
      data:
        item.kind === 'FRAME'
          ? { avatarFrame: item.value ?? null }
          : { nameColor: item.value ?? null },
    });
    return this.result(userId);
  }

  /**
   * Тратит один расходник, если он есть. Возвращает `false`, когда запас
   * пуст, — вызывающая сторона решает, что это значит для неё.
   *
   * Списание условное (`gt: 0`) по той же причине, что и покупка: два
   * одновременных вызова иначе истратят один хранитель дважды и уведут
   * счётчик в минус.
   */
  async consume(
    userId: string,
    itemId: ShopItemId,
    /**
     * Клиент чужой транзакции, когда трата — часть большего действия.
     *
     * Без него «списать расходник» и «выдать то, за что он списан» —
     * две отдельные записи, и падение между ними отбирает у игрока
     * покупку, ничего не дав взамен.
     */
    tx?: Pick<PrismaService, 'user'>,
  ): Promise<boolean> {
    const field = this.stockField(itemId);
    if (!field) return false;

    const db = tx ?? this.prisma;
    const spent = await db.user.updateMany({
      where: { id: userId, [field]: { gt: 0 } },
      data: { [field]: { decrement: 1 } },
    });
    return spent.count > 0;
  }

  private async result(userId: string): Promise<ShopActionResult> {
    const [owner, owned] = await Promise.all([
      this.owner(userId),
      this.ownedCosmetics(userId),
    ]);
    return { coins: owner.coins, items: this.states(owner, owned) };
  }

  private async owner(userId: string): Promise<ShopOwner> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        coins: true,
        streakFreezes: true,
        dailyWordRetries: true,
        avatarFrame: true,
        nameColor: true,
      },
    });
    return user;
  }

  private async ownedCosmetics(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.shopPurchase.findMany({
      where: { userId },
      select: { itemId: true },
      distinct: ['itemId'],
    });
    return new Set(rows.map((row) => row.itemId));
  }

  private states(owner: ShopOwner, owned: Set<string>): ShopItemState[] {
    return SHOP_ITEMS.map((item) => ({
      id: item.id,
      owned: isCosmetic(item) && owned.has(item.id),
      equipped:
        item.kind === 'FRAME'
          ? owner.avatarFrame === item.value
          : item.kind === 'NAME_COLOR'
            ? owner.nameColor === item.value
            : false,
      stock: this.stockIn(owner, item.id),
    }));
  }

  /** Расходники лежат счётчиками в `User` — по колонке на вид. */
  private stockField(
    itemId: string,
  ): 'streakFreezes' | 'dailyWordRetries' | null {
    if (itemId === 'streak_freeze') return 'streakFreezes';
    if (itemId === 'daily_word_retry') return 'dailyWordRetries';
    return null;
  }

  private stockIn(owner: ShopOwner, itemId: string): number {
    const field = this.stockField(itemId);
    return field ? owner[field] : 0;
  }

  private async stockOf(
    tx: Pick<PrismaService, 'user'>,
    userId: string,
    itemId: string,
  ): Promise<number> {
    const field = this.stockField(itemId);
    if (!field) return 0;
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { [field]: true },
    });
    return (user as unknown as Record<string, number>)[field] ?? 0;
  }

  /** Что покупка немедленно даёт: расходник ложится в запас, оформление —
   * только в журнал покупок (надевается отдельно, по желанию). */
  private grantOf(
    item: ShopItemDefinition,
  ): Record<string, { increment: number }> {
    const field = this.stockField(item.id);
    return field ? { [field]: { increment: 1 } } : {};
  }
}
