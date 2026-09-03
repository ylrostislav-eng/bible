import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { RemindersService } from './reminders.service';
import { TelegramBotService } from './telegram-bot.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, TelegramBotService, RemindersService],
  exports: [NotificationsService, TelegramBotService, RemindersService],
})
export class NotificationsModule {}
