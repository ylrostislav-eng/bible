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
   * Жалоба на игрока.
   *
   * Раньше жаловаться можно было и на конкретное сообщение — текст при этом
   * копировался в жалобу, чтобы улику нельзя было удалить вместе с
   * перепиской. Личной переписки в приложении больше нет, поэтому осталась
   * жалоба на человека: за поведение в комнате, за ник, за спам
   * приглашениями.
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

    try {
      await this.prisma.abuseReport.create({
        data: {
          reason: dto.reason,
          comment: dto.comment?.trim() || null,
          reporterId,
          targetUserId: dto.targetUserId,
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
      reason: row.reason,
      comment: row.comment,
      reporterNickname: row.reporter.nickname,
      targetUserId: row.targetUserId,
      targetNickname: row.targetUser.nickname,
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

  /**
   * Ограничение по жалобам: пока оно действует, нельзя дотянуться до
   * другого человека — ни заявкой в друзья, ни вызовом на дуэль, ни
   * приглашением в комнату. Играть и читать при этом можно.
   *
   * Раньше это был мут в чате, и после удаления личной переписки проверка
   * осталась без единого вызова — санкция модерации перестала что-либо
   * значить. Поэтому её подключили ко всему, чем ещё можно донимать
   * человека: смысл наказания не в конкретном канале, а в том, чтобы
   * обидчик до жертвы не доставал.
   */
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
        `Приглашения и заявки ограничены ещё ${hours} ч. по жалобе других игроков`,
      );
    }
  }
}
