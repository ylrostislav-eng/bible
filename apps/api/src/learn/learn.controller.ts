import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { StartChapterCheckDto } from './dto/start-chapter-check.dto';
import { SubmitChapterCheckAnswerDto } from './dto/submit-chapter-check-answer.dto';
import { LearnService } from './learn.service';

@UseGuards(JwtAuthGuard)
@Controller('learn')
export class LearnController {
  constructor(private readonly learnService: LearnService) {}

  @Post('check/start')
  async startCheck(
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: StartChapterCheckDto,
  ) {
    return this.learnService.startCheck(currentUser.sub, dto);
  }

  @Post('check/:sessionId/answer')
  async submitAnswer(
    @CurrentUser() currentUser: JwtPayload,
    @Param('sessionId') sessionId: string,
    @Body() dto: SubmitChapterCheckAnswerDto,
  ) {
    return this.learnService.submitAnswer(currentUser.sub, sessionId, dto);
  }

  @Post('check/:sessionId/advance')
  async advance(
    @CurrentUser() currentUser: JwtPayload,
    @Param('sessionId') sessionId: string,
  ) {
    return this.learnService.advance(currentUser.sub, sessionId);
  }
}
