import { Module } from '@nestjs/common';
import { ContactModule } from '../contact/contact.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PresenceModule } from '../presence/presence.module';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';

@Module({
  imports: [PresenceModule, NotificationsModule, ContactModule],
  controllers: [FriendsController],
  providers: [FriendsService],
  // Экспортируется ради приглашений по ссылке: вход связывает пришедшего с
  // тем, кто позвал (см. `AuthService.loginWithTelegram`).
  exports: [FriendsService],
})
export class FriendsModule {}
