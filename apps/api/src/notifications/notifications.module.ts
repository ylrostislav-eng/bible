import { Module } from '@nestjs/common';
import { PresenceModule } from '../presence/presence.module';
import { InviteNotifierService } from './invite-notifier.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { RemindersService } from './reminders.service';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramUpdatesController } from './telegram-updates.controller';
import { TelegramUpdatesService } from './telegram-updates.service';

@Module({
  imports: [PresenceModule],
  controllers: [NotificationsController, TelegramUpdatesController],
  providers: [
    NotificationsService,
    TelegramBotService,
    RemindersService,
    InviteNotifierService,
    TelegramUpdatesService,
  ],
  exports: [
    NotificationsService,
    TelegramBotService,
    RemindersService,
    InviteNotifierService,
  ],
})
export class NotificationsModule {}
