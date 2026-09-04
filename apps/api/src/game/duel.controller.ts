import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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

  // A 6-character code (32-symbol alphabet) is guessable in bulk if
  // nothing caps the attempt rate — well below the global default, since
  // this is the one endpoint an attacker would actually want to hammer.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('join')
  join(@CurrentUser() user: JwtPayload, @Body() dto: JoinDuelDto) {
    return this.duelService.join(user.sub, dto);
  }

  /**
   * «Найти соперника» — подбор незнакомца вместо кода от друга.
   *
   * Ограничение своё: каждый промах подбора заводит ожидающую дуэль, и без
   * потолка их можно наплодить сколько угодно. Стоит эта кнопка **после**
   * `join`: декоратор действует на следующий за ним метод, и вставленный
   * между `@Throttle` и `join` обработчик молча забрал бы себе чужое
   * ограничение, оставив угадывание кодов без потолка вовсе.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('find-opponent')
  async findOpponent(
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: CreateDuelDto,
  ) {
    return this.duelService.findOpponent(currentUser.sub, dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('preview/:inviteCode')
  preview(@Param('inviteCode') inviteCode: string) {
    return this.duelService.preview(inviteCode);
  }

  @Post('challenge')
  challenge(@CurrentUser() user: JwtPayload, @Body() dto: ChallengeFriendDto) {
    return this.duelService.challenge(user.sub, dto);
  }

  @Post(':sessionId/cancel')
  async cancel(
    @CurrentUser() user: JwtPayload,
    @Param('sessionId') sessionId: string,
  ) {
    await this.duelService.cancel(user.sub, sessionId);
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
