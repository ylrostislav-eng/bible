import { Module } from '@nestjs/common';
import { ModerationModule } from '../moderation/moderation.module';
import { PresenceModule } from '../presence/presence.module';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

@Module({
  imports: [PresenceModule, ModerationModule],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
})
export class ChatModule {}
