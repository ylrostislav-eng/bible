import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { StartSoloGameDto } from './dto/start-solo-game.dto';
import { SubmitAnswerDto } from './dto/submit-answer.dto';
import { GameService } from './game.service';

@UseGuards(JwtAuthGuard)
@Controller('game/solo')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Post('start')
  start(@CurrentUser() user: JwtPayload, @Body() dto: StartSoloGameDto) {
    return this.gameService.startSolo(user.sub, dto);
  }

  @Post(':sessionId/answer')
  answer(
    @CurrentUser() user: JwtPayload,
    @Param('sessionId') sessionId: string,
    @Body() dto: SubmitAnswerDto,
  ) {
    return this.gameService.submitAnswer(user.sub, sessionId, dto);
  }
}
