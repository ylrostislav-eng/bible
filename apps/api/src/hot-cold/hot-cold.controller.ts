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
import { HotColdService } from './hot-cold.service';

export class HotColdGuessDto {
  @IsString()
  @Length(1, 64)
  guess!: string;
}

/**
 * Часовой пояс берётся из заголовка, который клиент шлёт с каждым запросом
 * (см. `apps/web/src/lib/api.ts`), а не из профиля: день меняется в полночь
 * игрока, и если он в дороге сменил пояс, слово должно смениться вместе с
 * ним, а не после следующего открытия профиля.
 */
function readOffset(header?: string): number {
  const parsed = Number(header);
  return Number.isFinite(parsed) ? parsed : 0;
}

@UseGuards(JwtAuthGuard)
@Controller('hot-cold')
export class HotColdController {
  constructor(private readonly hotColdService: HotColdService) {}

  @Get()
  async today(
    @CurrentUser() currentUser: JwtPayload,
    @Headers('x-timezone-offset') offset?: string,
  ) {
    return this.hotColdService.getState(currentUser.sub, readOffset(offset));
  }

  @Post('guess')
  async guess(
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: HotColdGuessDto,
    @Headers('x-timezone-offset') offset?: string,
  ) {
    return this.hotColdService.guess(
      currentUser.sub,
      readOffset(offset),
      dto.guess,
    );
  }

  @Post('hint')
  async hint(
    @CurrentUser() currentUser: JwtPayload,
    @Headers('x-timezone-offset') offset?: string,
  ) {
    return this.hotColdService.takeHint(currentUser.sub, readOffset(offset));
  }
}
