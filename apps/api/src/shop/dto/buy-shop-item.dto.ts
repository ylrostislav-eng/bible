import { SHOP_ITEMS, SHOP_UNKNOWN_ITEM_MESSAGE } from '@bible-arena/shared';
import { IsIn } from 'class-validator';

/** Покупать можно только то, что есть в каталоге: список товаров — правило
 * игры, и присланный клиентом идентификатор проверяется по нему, а не
 * принимается на веру.
 *
 * Сообщение своё, а не от валидатора: тот в ответ на выдуманный товар
 * перечисляет весь каталог по-английски. Такой запрос присылает не игрок,
 * но ответ всё равно уезжает на экран, и «frame_of_lies must be one
 * of...» там — мусор вместо объяснения. _Нашлось живой проверкой._ */
export class BuyShopItemDto {
  @IsIn(SHOP_ITEMS.map((item) => item.id), {
    message: SHOP_UNKNOWN_ITEM_MESSAGE,
  })
  itemId!: string;
}
