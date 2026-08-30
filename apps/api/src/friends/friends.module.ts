import { Module } from '@nestjs/common';
import { PresenceModule } from '../presence/presence.module';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';

@Module({
  imports: [PresenceModule],
  controllers: [FriendsController],
  providers: [FriendsService],
})
export class FriendsModule {}
