import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DEFAULT_MUTE_HOURS, type AbuseReportView } from '@bible-arena/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateReportDto } from './dto/create-report.dto';

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Files a complaint. Reporting a specific message copies its text into
   * the report — the offender can delete the conversation, and a complaint
   * whose evidence is gone can't be reviewed.
   */
  async report(reporterId: string, dto: CreateReportDto): Promise<void> {
    if (dto.targetUserId === reporterId) {
      throw new BadRequestException('Нельзя пожаловаться на самого себя');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: dto.targetUserId },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException('Игрок не найден');
    }

    let messageBody: string | null = null;
    if (dto.messageId) {
      const message = await this.prisma.chatMessage.findUnique({
        where: { id: dto.messageId },
      });
      // Only a message actually addressed to the reporter can be reported by
      // them, and only against its real sender — otherwise a report could be
      // used to attach someone else's words to an innocent player.
      if (
        !message ||
        message.recipientId !== reporterId ||
        message.senderId !== dto.targetUserId
      ) {
        throw new NotFoundException('Сообщение не найдено');
      }
      messageBody = message.body;
    }

    try {
      await this.prisma.abuseReport.create({
        data: {
          kind: dto.messageId ? 'MESSAGE' : 'USER',
          reason: dto.reason,
          comment: dto.comment?.trim() || null,
          reporterId,
          targetUserId: dto.targetUserId,
          messageId: dto.messageId ?? null,
          messageBody,
        },
      });
    } catch (error) {
      // The unique constraint is the point, not an error: one person can't
      // file the same complaint twice, so a repeat tap is a no-op rather
      // than something that inflates the count triage sorts by.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }
  }

  /** Whether this user is currently barred from sending chat messages. */
  async isMuted(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mutedUntil: true },
    });
    return !!user?.mutedUntil && user.mutedUntil > new Date();
  }

  // ---- moderator side ----

  async listReports(status?: 'PENDING' | 'ACTIONED' | 'DISMISSED') {
    const rows = await this.prisma.abuseReport.findMany({
      where: { status: status ?? 'PENDING' },
      include: { reporter: true, targetUser: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // One grouped query rather than a count per row — the same N+1 trap the
    // conversation list had before.
    const grouped = await this.prisma.abuseReport.groupBy({
      by: ['targetUserId'],
      where: { status: 'PENDING' },
      _count: { _all: true },
    });
    const pendingByTarget = new Map(
      grouped.map((g) => [g.targetUserId, g._count._all]),
    );

    return rows.map((row): AbuseReportView => ({
      id: row.id,
      kind: row.kind,
      reason: row.reason,
      comment: row.comment,
      reporterNickname: row.reporter.nickname,
      targetUserId: row.targetUserId,
      targetNickname: row.targetUser.nickname,
      messageBody: row.messageBody,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      pendingAgainstTarget: pendingByTarget.get(row.targetUserId) ?? 0,
      targetMutedUntil: row.targetUser.mutedUntil?.toISOString() ?? null,
    }));
  }

  /**
   * Upholds a complaint and mutes the reported player for `muteHours`.
   * Every other still-pending complaint about the same person is closed at
   * the same time — they describe the same behaviour that was just acted
   * on, and leaving them open would mean muting again for the same thing.
   */
  async uphold(
    reportId: string,
    muteHours: number = DEFAULT_MUTE_HOURS,
    note?: string,
  ): Promise<{ mutedUntil: Date }> {
    const report = await this.prisma.abuseReport.findUnique({
      where: { id: reportId },
    });
    if (!report) {
      throw new NotFoundException('Жалоба не найдена');
    }
    if (muteHours <= 0 || muteHours > 24 * 365) {
      throw new BadRequestException('Некорректный срок ограничения');
    }
    const mutedUntil = new Date(Date.now() + muteHours * 60 * 60 * 1000);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: report.targetUserId },
        data: { mutedUntil },
      }),
      this.prisma.abuseReport.updateMany({
        where: { targetUserId: report.targetUserId, status: 'PENDING' },
        data: {
          status: 'ACTIONED',
          reviewedAt: new Date(),
          reviewNote: note?.trim() || null,
        },
      }),
    ]);

    return { mutedUntil };
  }

  async dismiss(reportId: string, note?: string): Promise<void> {
    const updated = await this.prisma.abuseReport.updateMany({
      where: { id: reportId, status: 'PENDING' },
      data: {
        status: 'DISMISSED',
        reviewedAt: new Date(),
        reviewNote: note?.trim() || null,
      },
    });
    if (updated.count === 0) {
      throw new NotFoundException('Жалоба не найдена или уже разобрана');
    }
  }

  /** Lifts a mute early. */
  async unmute(userId: string): Promise<void> {
    const updated = await this.prisma.user.updateMany({
      where: { id: userId },
      data: { mutedUntil: null },
    });
    if (updated.count === 0) {
      throw new NotFoundException('Игрок не найден');
    }
  }

  async assertNotMuted(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mutedUntil: true },
    });
    if (user?.mutedUntil && user.mutedUntil > new Date()) {
      const hours = Math.ceil(
        (user.mutedUntil.getTime() - Date.now()) / (60 * 60 * 1000),
      );
      throw new ForbiddenException(
        `Отправка сообщений ограничена ещё ${hours} ч. по жалобе других игроков`,
      );
    }
  }
}
