import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { HotColdController } from './hot-cold.controller';
import { HotColdService } from './hot-cold.service';

@Module({
  imports: [UsersModule],
  controllers: [HotColdController],
  providers: [HotColdService],
})
export class HotColdModule {}
