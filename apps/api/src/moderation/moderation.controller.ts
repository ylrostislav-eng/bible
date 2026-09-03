import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { CreateReportDto } from './dto/create-report.dto';
import { ModerationService } from './moderation.service';

@UseGuards(JwtAuthGuard)
@Controller('moderation')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  /** Filing a complaint is deliberately rate-limited: a flood of reports is
   * itself a way to harass someone, and triage sorts by how many people
   * complained. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reports')
  async report(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateReportDto,
  ): Promise<void> {
    await this.moderationService.report(user.sub, dto);
  }

  @UseGuards(AdminGuard)
  @Get('reports')
  listReports(@Query('status') status?: 'PENDING' | 'ACTIONED' | 'DISMISSED') {
    return this.moderationService.listReports(status);
  }

  @UseGuards(AdminGuard)
  @Patch('reports/:id/uphold')
  uphold(
    @Param('id') id: string,
    @Body() body: { muteHours?: number; note?: string },
  ) {
    return this.moderationService.uphold(id, body?.muteHours, body?.note);
  }

  @UseGuards(AdminGuard)
  @Patch('reports/:id/dismiss')
  async dismiss(@Param('id') id: string, @Body() body: { note?: string }) {
    await this.moderationService.dismiss(id, body?.note);
  }

  @UseGuards(AdminGuard)
  @Patch('users/:userId/unmute')
  async unmute(@Param('userId') userId: string): Promise<void> {
    await this.moderationService.unmute(userId);
  }
}
