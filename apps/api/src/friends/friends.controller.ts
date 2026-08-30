import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { FriendsService } from './friends.service';

@UseGuards(JwtAuthGuard)
@Controller('friends')
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Get()
  getOverview(@CurrentUser() user: JwtPayload) {
    return this.friendsService.getOverview(user.sub);
  }

  @Get('search')
  search(@CurrentUser() user: JwtPayload, @Query('q') q: string) {
    return this.friendsService.search(user.sub, q ?? '');
  }

  @Post('requests')
  sendRequest(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SendFriendRequestDto,
  ) {
    return this.friendsService.sendRequest(user.sub, dto.toUserId);
  }

  @Post('requests/:requestId/accept')
  acceptRequest(
    @CurrentUser() user: JwtPayload,
    @Param('requestId') requestId: string,
  ) {
    return this.friendsService.acceptRequest(user.sub, requestId);
  }

  @Post('requests/:requestId/decline')
  declineRequest(
    @CurrentUser() user: JwtPayload,
    @Param('requestId') requestId: string,
  ) {
    return this.friendsService.declineRequest(user.sub, requestId);
  }

  @Delete(':friendId')
  unfriend(
    @CurrentUser() user: JwtPayload,
    @Param('friendId') friendId: string,
  ) {
    return this.friendsService.unfriend(user.sub, friendId);
  }
}
