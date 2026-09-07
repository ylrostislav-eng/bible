import { Module } from '@nestjs/common';
import { PresenceModule } from '../presence/presence.module';
import { InviteNotifierService } from './invite-notifier.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { RemindersService } from './reminders.service';
import { TelegramBotService } from './telegram-bot.service';

@Module({
  imports: [PresenceModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    TelegramBotService,
    RemindersService,
    InviteNotifierService,
  ],
  exports: [
    NotificationsService,
    TelegramBotService,
    RemindersService,
    InviteNotifierService,
  ],
})
export class NotificationsModule {}
