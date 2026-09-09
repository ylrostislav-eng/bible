import { Module } from '@nestjs/common';
import { ShopModule } from '../shop/shop.module';
import { UsersModule } from '../users/users.module';
import { DailyWordController } from './daily-word.controller';
import { DailyWordService } from './daily-word.service';

@Module({
  imports: [UsersModule, ShopModule],
  controllers: [DailyWordController],
  providers: [DailyWordService],
})
export class DailyWordModule {}
