import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { DailyWordService } from './daily-word.service';

export class DailyWordGuessDto {
  @IsString()
  @Length(1, 64)
  guess!: string;
}

/**
 * Часовой пояс берётся из заголовка, который клиент шлёт с каждым запросом
 * (см. `apps/web/src/lib/api.ts`), а не из профиля: слово дня меняется в
 * полночь игрока, и если он в дороге сменил пояс, день должен смениться
 * вместе с ним, а не после следующего открытия профиля.
 */
function readOffset(header?: string): number {
  const parsed = Number(header);
  return Number.isFinite(parsed) ? parsed : 0;
}

@UseGuards(JwtAuthGuard)
@Controller('daily-word')
export class DailyWordController {
  constructor(private readonly dailyWordService: DailyWordService) {}

  @Get()
  async today(
    @CurrentUser() currentUser: JwtPayload,
    @Headers('x-timezone-offset') offset?: string,
  ) {
    return this.dailyWordService.getState(currentUser.sub, readOffset(offset));
  }

  @Post('hint')
  async hint(
    @CurrentUser() currentUser: JwtPayload,
    @Headers('x-timezone-offset') offset?: string,
  ) {
    return this.dailyWordService.takeHint(currentUser.sub, readOffset(offset));
  }

  @Post('guess')
  async guess(
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: DailyWordGuessDto,
    @Headers('x-timezone-offset') offset?: string,
  ) {
    return this.dailyWordService.guess(
      currentUser.sub,
      readOffset(offset),
      dto.guess,
    );
  }

  @Get('friends')
  async friends(
    @CurrentUser() currentUser: JwtPayload,
    @Headers('x-timezone-offset') offset?: string,
  ) {
    return this.dailyWordService.friendResults(
      currentUser.sub,
      readOffset(offset),
    );
  }
}
