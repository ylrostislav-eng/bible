import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { DiceAction } from '@bible-arena/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import {
  CreateDiceMatchDto,
  CreateDiceSoloDto,
  DiceActionDto,
  DiceFindOpponentDto,
  DiceInviteCodeDto,
} from './dto/dice.dto';
import { DiceService } from './dice.service';

@UseGuards(JwtAuthGuard)
@Controller('dice')
export class DiceController {
  constructor(private readonly dice: DiceService) {}

  /**
   * Партия, в которую можно вернуться: приложение закрыли, матч остался.
   *
   * Ответ — всегда объект `{ match }`, даже когда партии нет. Голый `null`
   * Nest отдаёт **пустым телом**, и разбор JSON на клиенте падает на
   * ровном месте. _Нашлось живой проверкой._
   */
  @Get('active')
  async active(@CurrentUser() user: JwtPayload) {
    return { match: await this.dice.activeFor(user.sub) };
  }

  @Get('waiting')
  waiting(@CurrentUser() user: JwtPayload) {
    return this.dice.waitingOpponents(user.sub);
  }

  @Get('progress')
  progress(@CurrentUser() user: JwtPayload) {
    return this.dice.progress(user.sub);
  }

  @Post('solo')
  solo(@CurrentUser() user: JwtPayload, @Body() dto: CreateDiceSoloDto) {
    return this.dice.create(user.sub, {
      targetScore: dto.targetScore,
      botDifficulty: dto.difficulty,
    });
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateDiceMatchDto) {
    return this.dice.create(user.sub, dto);
  }

  @Post('find')
  find(@CurrentUser() user: JwtPayload, @Body() dto: DiceFindOpponentDto) {
    return this.dice.findOpponent(user.sub, dto.targetScore);
  }

  @Post('join-by-code')
  joinByCode(@CurrentUser() user: JwtPayload, @Body() dto: DiceInviteCodeDto) {
    return this.dice.byInviteCode(user.sub, dto.code);
  }

  @Post(':id/join')
  join(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.dice.join(user.sub, id);
  }

  @Post(':id/action')
  act(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: DiceActionDto,
  ) {
    return this.dice.act(
      user.sub,
      id,
      toAction(dto),
      dto.actionId,
      dto.expectedVersion,
    );
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.dice.cancel(user.sub, id);
  }

  @Post(':id/rematch')
  rematch(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.dice.rematch(user.sub, id);
  }

  /** Состояние партии. Отдаётся только её участнику — проверяет сервис. */
  @Get(':id')
  state(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.dice.view(id, user.sub);
  }
}

function toAction(dto: DiceActionDto): DiceAction {
  if (dto.type === 'SELECT') {
    if (!dto.indexes || dto.indexes.length === 0) {
      throw new BadRequestException('Не выбрано ни одной кости');
    }
    return { type: 'SELECT', indexes: dto.indexes };
  }
  return { type: dto.type };
}
