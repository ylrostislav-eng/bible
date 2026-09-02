import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ErrorReportSource } from '@prisma/client';
import type { Request } from 'express';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { ReportClientErrorDto } from './dto/report-client-error.dto';
import { TelemetryService } from './telemetry.service';

@Controller('telemetry')
export class TelemetryController {
  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Deliberately unguarded: a crash can happen before the user is logged
   * in (or because login itself is what's broken), and error reporting
   * must never itself require a working auth flow to succeed. Attaches a
   * `userId` best-effort by verifying the bearer token if one is present,
   * without ever throwing on a missing/invalid one.
   */
  @Post('client-error')
  async reportClientError(
    @Body() dto: ReportClientErrorDto,
    @Req() request: Request,
  ): Promise<void> {
    const userId = await this.tryExtractUserId(request);
    await this.telemetryService.record({
      source: 'WEB',
      kind: dto.kind,
      message: dto.message,
      stack: dto.stack,
      path: dto.path,
      userId,
      extra: dto.extra,
    });
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('reports')
  list(
    @Query('resolved') resolved?: string,
    @Query('source') source?: ErrorReportSource,
    @Query('limit') limit?: string,
  ) {
    return this.telemetryService.list({
      resolved: resolved === undefined ? undefined : resolved === 'true',
      source,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('reports/summary')
  summary(@Query('sinceHours') sinceHours?: string) {
    const since = sinceHours
      ? new Date(Date.now() - Number(sinceHours) * 60 * 60 * 1000)
      : undefined;
    return this.telemetryService.summary({ since });
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('reports/:id/resolve')
  async resolve(@Param('id') id: string): Promise<void> {
    await this.telemetryService.resolve(id);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('reports/resolve-group')
  resolveGroup(
    @Body() body: { source: ErrorReportSource; kind: string; message: string },
  ) {
    return this.telemetryService.resolveGroup(body);
  }

  private async tryExtractUserId(
    request: Request,
  ): Promise<string | undefined> {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        header.slice('Bearer '.length),
      );
      return payload.sub;
    } catch {
      return undefined;
    }
  }
}
