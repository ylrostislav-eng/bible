import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { ChallengeFriendDto } from './dto/challenge-friend.dto';
import { CreateDuelDto } from './dto/create-duel.dto';
import { DuelAnswerDto } from './dto/duel-answer.dto';
import { JoinDuelDto } from './dto/join-duel.dto';
import { RespondToChallengeDto } from './dto/respond-to-challenge.dto';
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

  @Get('preview/:inviteCode')
  preview(@Param('inviteCode') inviteCode: string) {
    return this.duelService.preview(inviteCode);
  }

  @Post('challenge')
  challenge(@CurrentUser() user: JwtPayload, @Body() dto: ChallengeFriendDto) {
    return this.duelService.challenge(user.sub, dto);
  }

  @Get('pending-challenges')
  pendingChallenges(@CurrentUser() user: JwtPayload) {
    return this.duelService.pendingChallenges(user.sub);
  }

  @Post(':sessionId/respond')
  respondToChallenge(
    @CurrentUser() user: JwtPayload,
    @Param('sessionId') sessionId: string,
    @Body() dto: RespondToChallengeDto,
  ) {
    return this.duelService.respondToChallenge(user.sub, sessionId, dto);
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
