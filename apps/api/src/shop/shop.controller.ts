import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { BuyShopItemDto } from './dto/buy-shop-item.dto';
import { EquipShopItemDto } from './dto/equip-shop-item.dto';
import { ShopService } from './shop.service';

@UseGuards(JwtAuthGuard)
@Controller('shop')
export class ShopController {
  constructor(private readonly shop: ShopService) {}

  @Get()
  view(@CurrentUser() user: JwtPayload) {
    return this.shop.view(user.sub);
  }

  @Post('buy')
  buy(@CurrentUser() user: JwtPayload, @Body() dto: BuyShopItemDto) {
    return this.shop.buy(user.sub, dto.itemId);
  }

  @Post('equip')
  equip(@CurrentUser() user: JwtPayload, @Body() dto: EquipShopItemDto) {
    return this.shop.equip(user.sub, dto.itemId);
  }
}
