import { Module } from '@nestjs/common';
import { ContactModule } from '../contact/contact.module';
import { PresenceModule } from '../presence/presence.module';
import { UsersModule } from '../users/users.module';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';

@Module({
  imports: [PresenceModule, ContactModule, UsersModule],
  controllers: [PlayersController],
  providers: [PlayersService],
})
export class PlayersModule {}
