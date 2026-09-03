import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { AliasService } from './alias.service';
import { GetAliasDeckDto } from './dto/get-alias-deck.dto';
import { SaveAliasMatchDto } from './dto/save-alias-match.dto';

@UseGuards(JwtAuthGuard)
@Controller('alias')
export class AliasController {
  constructor(private readonly aliasService: AliasService) {}

  /** Сколько слов подходит под текущие фильтры. Экран настройки спрашивает
   * это, пока фильтры ещё крутят, — чтобы не выяснять размер колоды уже
   * после «Начать». */
  @Get('count')
  async count(@Query() dto: GetAliasDeckDto) {
    return this.aliasService.countAvailable(dto);
  }

  @Get('deck')
  async deck(
    @CurrentUser() currentUser: JwtPayload,
    @Query() dto: GetAliasDeckDto,
  ) {
    return this.aliasService.getDeck(currentUser.sub, dto);
  }

  @Post('matches')
  async saveMatch(
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: SaveAliasMatchDto,
  ) {
    return this.aliasService.saveMatch(currentUser.sub, dto);
  }

  @Get('matches')
  async listMatches(@CurrentUser() currentUser: JwtPayload) {
    return this.aliasService.listMatches(currentUser.sub);
  }

  @Get('matches/:matchId')
  async getMatch(
    @CurrentUser() currentUser: JwtPayload,
    @Param('matchId') matchId: string,
  ) {
    return this.aliasService.getMatch(currentUser.sub, matchId);
  }
}
