import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, Length } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { HotColdDuelService } from './hot-cold-duel.service';

export class CreateHotColdDuelDto {
  /** Вызов конкретному другу. Пусто — открытый код, зайдёт кто угодно. */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  targetUserId?: string;
}

export class JoinHotColdDuelDto {
  @IsString()
  @Length(4, 12)
  code!: string;
}

/**
 * Вход в дуэль и выход из неё — обычным HTTP; всё, что происходит внутри
 * партии, идёт через `HotColdDuelGateway`.
 *
 * Разделение не формальное: создать дуэль надо один раз и знать результат
 * сразу, а ходы должны немедленно долетать до второго игрока — это разные
 * задачи, и сокет нужен только второй из них.
 */
@UseGuards(JwtAuthGuard)
@Controller('hot-cold/duel')
export class HotColdDuelController {
  constructor(private readonly duels: HotColdDuelService) {}

  /** Незакрытая дуэль игрока — чтобы вернуть его туда, где он был. */
  @Get('active')
  async active(@CurrentUser() currentUser: JwtPayload) {
    return { duelId: await this.duels.activeFor(currentUser.sub) };
  }

  @Post()
  async create(
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: CreateHotColdDuelDto,
  ) {
    return {
      duelId: await this.duels.create(currentUser.sub, dto.targetUserId),
    };
  }

  /** «Найти соперника» — подбор незнакомца вместо кода от друга. */
  @Post('find-opponent')
  async findOpponent(@CurrentUser() currentUser: JwtPayload) {
    return this.duels.findOpponent(currentUser.sub);
  }

  @Post('join')
  async join(
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: JoinHotColdDuelDto,
  ) {
    return { duelId: await this.duels.joinByCode(currentUser.sub, dto.code) };
  }

  @Get(':id')
  async state(@CurrentUser() currentUser: JwtPayload, @Param('id') id: string) {
    return this.duels.getState(id, currentUser.sub);
  }

  /** Разбор после дуэли: десятка ближайших слов. */
  @Get(':id/closest')
  async closest(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') id: string,
  ) {
    // Состояние читаем ради проверки участия: разбор чужой дуэли — это
    // подсказка, а не разбор.
    await this.duels.getState(id, currentUser.sub);
    return { closest: await this.duels.closest(id) };
  }
}
