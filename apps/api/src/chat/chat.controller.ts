import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { ChatService } from './chat.service';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  getConversations(@CurrentUser() user: JwtPayload) {
    return this.chatService.getConversations(user.sub);
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: JwtPayload) {
    return this.chatService.unreadCount(user.sub);
  }

  @Get(':friendId/messages')
  getMessages(
    @CurrentUser() user: JwtPayload,
    @Param('friendId') friendId: string,
    @Query('before') before?: string,
  ) {
    return this.chatService.getMessages(user.sub, friendId, before);
  }
}
