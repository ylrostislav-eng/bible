import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { BanUserDto } from './dto/ban-user.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { InviteToRoomDto } from './dto/invite-to-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { RoomsGateway } from './rooms.gateway';
import { RoomsService } from './rooms.service';

/** Only the actions needed before a live WebSocket connection exists:
 * creating a room, browsing the public list, and joining one. Everything
 * that happens once you're actually sitting in a room (ready-up, kick, ban,
 * start, answering) goes through `RoomsGateway` instead, since it needs to
 * broadcast to everyone else in the room anyway. */
@UseGuards(JwtAuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly roomsGateway: RoomsGateway,
  ) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateRoomDto) {
    return this.roomsService.create(user.sub, dto);
  }

  @Get()
  listPublic(@CurrentUser() user: JwtPayload) {
    return this.roomsService.listPublic(user.sub);
  }

  // Guards against brute-forcing either the invite code or a private
  // room's password — both are 6-character codes, well below the global
  // rate limit if left uncapped.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('join')
  join(@CurrentUser() user: JwtPayload, @Body() dto: JoinRoomDto) {
    return this.roomsService.join(user.sub, dto);
  }

  /** For leaving a room from somewhere that isn't connected to *that*
   * room's socket — e.g. accepting a different invite/challenge while
   * sitting in your own not-yet-started room prompts leaving it first, from
   * whatever screen the accept happened on. Notifies the gateway afterwards
   * so anyone still actually in the room sees the update live. */
  @Post(':sessionId/leave')
  async leave(
    @CurrentUser() user: JwtPayload,
    @Param('sessionId') sessionId: string,
  ) {
    const result = await this.roomsService.leave(user.sub, sessionId);
    await this.roomsGateway.notifyLeft(sessionId, result === null);
  }

  // ---- blacklist (leader-scoped, independent of any specific room) ----

  @Get('banned')
  listBanned(@CurrentUser() user: JwtPayload) {
    return this.roomsService.listBanned(user.sub);
  }

  @Post('banned')
  banUser(@CurrentUser() user: JwtPayload, @Body() dto: BanUserDto) {
    return this.roomsService.banUser(user.sub, dto.userId);
  }

  @Delete('banned/:userId')
  unbanUser(@CurrentUser() user: JwtPayload, @Param('userId') userId: string) {
    return this.roomsService.unbanUser(user.sub, userId);
  }

  // ---- friend invites ----

  @Get('invites/pending')
  listPendingInvites(@CurrentUser() user: JwtPayload) {
    return this.roomsService.listPendingInvites(user.sub);
  }

  @Post('invites/:inviteId/accept')
  acceptInvite(
    @CurrentUser() user: JwtPayload,
    @Param('inviteId') inviteId: string,
  ) {
    return this.roomsService.acceptInvite(user.sub, inviteId);
  }

  @Post('invites/:inviteId/decline')
  declineInvite(
    @CurrentUser() user: JwtPayload,
    @Param('inviteId') inviteId: string,
  ) {
    return this.roomsService.declineInvite(user.sub, inviteId);
  }

  @Post(':sessionId/invite')
  invite(
    @CurrentUser() user: JwtPayload,
    @Param('sessionId') sessionId: string,
    @Body() dto: InviteToRoomDto,
  ) {
    return this.roomsService.invite(user.sub, sessionId, dto.userId);
  }
}
