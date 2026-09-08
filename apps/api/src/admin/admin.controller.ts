import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard, GameMasterGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { AdminService } from './admin.service';
import {
  AdjustBalanceDto,
  BroadcastDto,
  BroadcastPreviewDto,
  DeletePlayerDto,
  MutePlayerDto,
  RenamePlayerDto,
} from './dto/admin.dto';

/**
 * Всё, что может администратор, кроме двух вещей, которые уже жили
 * отдельно и переезжать не должны: жалобы (`/moderation`) и ошибки
 * (`/telemetry`). Экран администратора зовёт все три.
 *
 * Каждый метод под двумя охранниками, и порядок важен: `JwtAuthGuard`
 * кладёт пользователя в запрос, `AdminGuard` его проверяет. Охранники
 * стоят на классе, а не на методах, — так забыть их у нового метода
 * нельзя.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  overview() {
    return this.adminService.overview();
  }

  @Get('players')
  players(@Query('q') q?: string) {
    return this.adminService.listPlayers(q ?? '');
  }

  @Get('players/:userId')
  player(@Param('userId') userId: string) {
    return this.adminService.playerCard(userId);
  }

  @Post('players/:userId/mute')
  async mute(
    @CurrentUser() user: JwtPayload,
    @Param('userId') userId: string,
    @Body() dto: MutePlayerDto,
  ) {
    const admin = await this.adminService.identify(user.sub);
    return this.adminService.mute(admin, userId, dto.hours, dto.reason);
  }

  @Post('players/:userId/unmute')
  async unmute(
    @CurrentUser() user: JwtPayload,
    @Param('userId') userId: string,
  ): Promise<void> {
    const admin = await this.adminService.identify(user.sub);
    await this.adminService.unmute(admin, userId);
  }

  @Patch('players/:userId/nickname')
  async rename(
    @CurrentUser() user: JwtPayload,
    @Param('userId') userId: string,
    @Body() dto: RenamePlayerDto,
  ) {
    const admin = await this.adminService.identify(user.sub);
    return this.adminService.rename(admin, userId, dto.nickname);
  }

  @UseGuards(GameMasterGuard)
  @Post('players/:userId/balance')
  async balance(
    @CurrentUser() user: JwtPayload,
    @Param('userId') userId: string,
    @Body() dto: AdjustBalanceDto,
  ) {
    const admin = await this.adminService.identify(user.sub);
    return this.adminService.adjustBalance(
      admin,
      userId,
      { coins: dto.coins, rating: dto.rating },
      dto.note,
    );
  }

  /** Необратимо — поэтому и лимит строгий, и подтверждение ником в теле,
   * и право только у гейм-мастера. */
  @UseGuards(GameMasterGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Delete('players/:userId')
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('userId') userId: string,
    @Body() dto: DeletePlayerDto,
  ): Promise<void> {
    const admin = await this.adminService.identify(user.sub);
    await this.adminService.deleteAccount(admin, userId, dto.confirmNickname);
  }

  @Get('sessions')
  sessions() {
    return this.adminService.activeSessions();
  }

  @Post('sessions/:sessionId/close')
  async closeSession(
    @CurrentUser() user: JwtPayload,
    @Param('sessionId') sessionId: string,
  ): Promise<void> {
    const admin = await this.adminService.identify(user.sub);
    await this.adminService.closeSession(admin, sessionId);
  }

  @UseGuards(GameMasterGuard)
  @Post('broadcast/preview')
  preview(@Body() dto: BroadcastPreviewDto) {
    return this.adminService.broadcastPreview(dto.audience);
  }

  /**
   * Отправка идёт по одному сообщению в секунду тридцать, поэтому запрос
   * может занять минуты — это осознанно (см. `AdminService.broadcast`).
   * Лимит строгий не от злоупотребления, а от двойного нажатия: повторно
   * разосланное всем сообщение отменить уже нельзя.
   */
  @UseGuards(GameMasterGuard)
  @Throttle({ default: { limit: 2, ttl: 300_000 } })
  @Post('broadcast')
  async broadcast(@CurrentUser() user: JwtPayload, @Body() dto: BroadcastDto) {
    const admin = await this.adminService.identify(user.sub);
    return this.adminService.broadcast(admin, dto.audience, dto.text);
  }

  /** Журнал гейм-мастера: ему — весь, администратору — его строки. */
  @Get('actions')
  async actions(
    @CurrentUser() user: JwtPayload,
    @Query('limit') limit?: string,
  ) {
    const actor = await this.adminService.identify(user.sub);
    return this.adminService.actions(actor, limit ? Number(limit) : undefined);
  }
}
