import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { RoomsService } from './rooms.service';

/** Only the actions needed before a live WebSocket connection exists:
 * creating a room, browsing the public list, and joining one. Everything
 * that happens once you're actually sitting in a room (ready-up, kick, ban,
 * start, answering) goes through `RoomsGateway` instead, since it needs to
 * broadcast to everyone else in the room anyway. */
@UseGuards(JwtAuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateRoomDto) {
    return this.roomsService.create(user.sub, dto);
  }

  @Get()
  listPublic() {
    return this.roomsService.listPublic();
  }

  @Post('join')
  join(@CurrentUser() user: JwtPayload, @Body() dto: JoinRoomDto) {
    return this.roomsService.join(user.sub, dto);
  }
}
