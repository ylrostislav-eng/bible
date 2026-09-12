import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
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

export class RespondHotColdInviteDto {
  @IsIn(['ACCEPT', 'DECLINE'])
  action!: 'ACCEPT' | 'DECLINE';
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

  /** Сколько человек сейчас ищут соперника — рядом с кнопкой поиска. */
  @Get('waiting')
  async waiting(@CurrentUser() currentUser: JwtPayload) {
    return this.duels.waitingOpponents(currentUser.sub);
  }

  @Post('join')
  async join(
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: JoinHotColdDuelDto,
  ) {
    return { duelId: await this.duels.joinByCode(currentUser.sub, dto.code) };
  }

  /** Личные вызовы, ждущие ответа именно от меня. */
  @Get('pending-invites')
  async pendingInvites(@CurrentUser() currentUser: JwtPayload) {
    return this.duels.pendingInvites(currentUser.sub);
  }

  @Post(':id/respond')
  async respond(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RespondHotColdInviteDto,
  ) {
    return this.duels.respondToInvite(currentUser.sub, id, dto.action);
  }

  /** Отменить свой же неотвеченный вызов — до того, как за стол сел кто-то
   * второй. */
  @Post(':id/cancel')
  async cancel(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') id: string,
  ) {
    await this.duels.cancel(currentUser.sub, id);
    return { ok: true };
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
