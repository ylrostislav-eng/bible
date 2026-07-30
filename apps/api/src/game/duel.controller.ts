import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { CreateDuelDto } from './dto/create-duel.dto';
import { DuelAnswerDto } from './dto/duel-answer.dto';
import { JoinDuelDto } from './dto/join-duel.dto';
import { DuelService } from './duel.service';

@UseGuards(JwtAuthGuard)
@Controller('game/duel')
export class DuelController {
  constructor(private readonly duelService: DuelService) {}

  @Post('create')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateDuelDto) {
    return this.duelService.create(user.sub, dto);
  }

  @Post('join')
  join(@CurrentUser() user: JwtPayload, @Body() dto: JoinDuelDto) {
    return this.duelService.join(user.sub, dto);
  }

  @Get(':sessionId')
  getState(
    @CurrentUser() user: JwtPayload,
    @Param('sessionId') sessionId: string,
  ) {
    return this.duelService.getState(user.sub, sessionId);
  }

  @Post(':sessionId/answer')
  answer(
    @CurrentUser() user: JwtPayload,
    @Param('sessionId') sessionId: string,
    @Body() dto: DuelAnswerDto,
  ) {
    return this.duelService.submitAnswer(user.sub, sessionId, dto);
  }

  @Post(':sessionId/next')
  advance(
    @CurrentUser() user: JwtPayload,
    @Param('sessionId') sessionId: string,
  ) {
    return this.duelService.advance(user.sub, sessionId);
  }
}
