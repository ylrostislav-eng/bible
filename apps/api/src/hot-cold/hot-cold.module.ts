import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { HotColdDuelController } from './hot-cold-duel.controller';
import { HotColdDuelGateway } from './hot-cold-duel.gateway';
import { HotColdDuelService } from './hot-cold-duel.service';
import { HotColdController } from './hot-cold.controller';
import { HotColdService } from './hot-cold.service';

@Module({
  imports: [UsersModule],
  controllers: [HotColdController, HotColdDuelController],
  providers: [HotColdService, HotColdDuelService, HotColdDuelGateway],
})
export class HotColdModule {}
