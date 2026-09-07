import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { PlayersService } from './players.service';

@UseGuards(JwtAuthGuard)
@Controller('players')
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  /** Список игроков — сначала те, кто в сети. `q` фильтрует по нику; тем же
   * запросом, а не отдельным поиском, чтобы на экране не было двух разных
   * списков с разными правилами. */
  @Get()
  list(@CurrentUser() user: JwtPayload, @Query('q') q?: string) {
    return this.playersService.list(user.sub, q ?? '');
  }
}
