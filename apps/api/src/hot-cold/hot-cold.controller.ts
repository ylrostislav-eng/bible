import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { HotColdService } from './hot-cold.service';

/**
 * Номер партии за день: 0 — слово дня, дальше свободные.
 *
 * Клиент называет его явно в каждом ходе, а не полагается на «последнюю
 * начатую» на сервере. Разница видна ровно в тот момент, когда игра
 * открыта в двух вкладках: без номера ход из одной уехал бы в партию
 * другой, и человек увидел бы свои слова в чужом списке.
 */
class RoundDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  round?: number;
}

export class HotColdDisputeDto extends RoundDto {
  @IsString()
  @Length(1, 64)
  word!: string;
}

export class HotColdGuessDto extends RoundDto {
  @IsString()
  @Length(1, 64)
  guess!: string;
}

export class HotColdHintDto extends RoundDto {}

export class HotColdQueryDto extends RoundDto {}

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
    @Query() query: HotColdQueryDto,
    @Headers('x-timezone-offset') offset?: string,
  ) {
    return this.hotColdService.getState(
      currentUser.sub,
      readOffset(offset),
      query.round,
    );
  }

  /** «Ещё слово» — следующая свободная партия. */
  @Post('next')
  async next(
    @CurrentUser() currentUser: JwtPayload,
    @Headers('x-timezone-offset') offset?: string,
  ) {
    return this.hotColdService.startNextRound(
      currentUser.sub,
      readOffset(offset),
    );
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
      dto.round,
    );
  }

  @Post('dispute')
  async dispute(
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: HotColdDisputeDto,
    @Headers('x-timezone-offset') offset?: string,
  ) {
    return this.hotColdService.dispute(
      currentUser.sub,
      readOffset(offset),
      dto.word,
      dto.round,
    );
  }

  @Post('hint')
  async hint(
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: HotColdHintDto,
    @Headers('x-timezone-offset') offset?: string,
  ) {
    return this.hotColdService.takeHint(
      currentUser.sub,
      readOffset(offset),
      dto.round,
    );
  }
}
