import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { ErrorReportSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RESOLVED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const UNRESOLVED_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

interface RecordErrorParams {
  source: ErrorReportSource;
  kind: string;
  message: string;
  stack?: string | null;
  statusCode?: number | null;
  path?: string | null;
  method?: string | null;
  userId?: string | null;
  extra?: Record<string, unknown>;
}

/**
 * Central sink for crash/error telemetry from both the API's own global
 * exception filter and the frontend's error reporters. Writing here must
 * never itself break the caller's request — every public method swallows
 * its own failures and logs them locally instead of throwing.
 */
@Injectable()
export class TelemetryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryService.name);
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.cleanupInterval = setInterval(() => {
      void this.cleanup();
    }, CLEANUP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
  }

  async record(params: RecordErrorParams): Promise<void> {
    try {
      await this.prisma.errorReport.create({
        data: {
          source: params.source,
          kind: params.kind,
          message: params.message.slice(0, 2000),
          stack: params.stack ? params.stack.slice(0, 8000) : null,
          statusCode: params.statusCode ?? null,
          path: params.path ? params.path.slice(0, 500) : null,
          method: params.method ?? null,
          userId: params.userId ?? null,
          extra: params.extra as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (err) {
      // Telemetry is best-effort by design — a DB hiccup here must never
      // surface as a failure of whatever real request triggered it.
      this.logger.warn(`Failed to record error report: ${String(err)}`);
    }
  }

  async list(params: {
    resolved?: boolean;
    source?: ErrorReportSource;
    limit?: number;
  }) {
    return this.prisma.errorReport.findMany({
      where: {
        resolved: params.resolved,
        source: params.source,
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(params.limit ?? 100, 500),
    });
  }

  /** Groups still-unresolved reports by their (source, kind, message)
   * signature so the same recurring crash shows up as one row with a count
   * instead of drowning the list — the fast "what's actually breaking"
   * overview. */
  async summary(params: { since?: Date }) {
    const rows = await this.prisma.errorReport.groupBy({
      by: ['source', 'kind', 'message'],
      where: {
        resolved: false,
        createdAt: params.since ? { gte: params.since } : undefined,
      },
      _count: { _all: true },
      _max: { createdAt: true, id: true },
      orderBy: { _count: { id: 'desc' } },
    });
    return rows.map((row) => ({
      source: row.source,
      kind: row.kind,
      message: row.message,
      count: row._count._all,
      lastSeenAt: row._max.createdAt,
      lastId: row._max.id,
    }));
  }

  async resolve(id: string): Promise<void> {
    await this.prisma.errorReport.updateMany({
      where: { id },
      data: { resolved: true, resolvedAt: new Date() },
    });
  }

  /** Marks every currently-unresolved report sharing a (source, kind,
   * message) signature as resolved in one go — the natural unit of work
   * once a recurring bug behind them has actually been fixed. */
  async resolveGroup(params: {
    source: ErrorReportSource;
    kind: string;
    message: string;
  }): Promise<number> {
    const result = await this.prisma.errorReport.updateMany({
      where: {
        source: params.source,
        kind: params.kind,
        message: params.message,
        resolved: false,
      },
      data: { resolved: true, resolvedAt: new Date() },
    });
    return result.count;
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    try {
      await this.prisma.errorReport.deleteMany({
        where: {
          resolved: true,
          resolvedAt: { lt: new Date(now - RESOLVED_RETENTION_MS) },
        },
      });
      await this.prisma.errorReport.deleteMany({
        where: { createdAt: { lt: new Date(now - UNRESOLVED_RETENTION_MS) } },
      });
    } catch (err) {
      this.logger.warn(`Error report cleanup failed: ${String(err)}`);
    }
  }
}
