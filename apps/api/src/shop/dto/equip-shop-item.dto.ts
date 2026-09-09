import {
  SHOP_ITEMS,
  SHOP_UNKNOWN_ITEM_MESSAGE,
  isCosmetic,
} from '@bible-arena/shared';
import { IsIn, ValidateIf } from 'class-validator';

const COSMETIC_IDS = SHOP_ITEMS.filter(isCosmetic).map((item) => item.id);

export class EquipShopItemDto {
  /** `null` — снять оформление и вернуться к обычному виду. */
  @ValidateIf((o: EquipShopItemDto) => o.itemId !== null)
  @IsIn(COSMETIC_IDS, { message: SHOP_UNKNOWN_ITEM_MESSAGE })
  itemId!: string | null;
}
