import { Injectable } from '@nestjs/common';
import type { DeclineNoticeView } from '@bible-arena/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Records that `declinedByUserId` turned down something `userId` sent
   * them — a duel challenge or a room invite. Fire-and-forget from the
   * caller's point of view: nothing about the decline itself depends on
   * this succeeding, so callers don't need to handle failure specially. */
  async recordDuelDecline(params: {
    userId: string;
    declinedByUserId: string;
  }): Promise<void> {
    await this.prisma.declineNotice.create({
      data: {
        userId: params.userId,
        declinedByUserId: params.declinedByUserId,
        kind: 'DUEL_CHALLENGE',
      },
    });
  }

  async recordRoomInviteDecline(params: {
    userId: string;
    declinedByUserId: string;
    roomName: string | null;
  }): Promise<void> {
    await this.prisma.declineNotice.create({
      data: {
        userId: params.userId,
        declinedByUserId: params.declinedByUserId,
        kind: 'ROOM_INVITE',
        roomName: params.roomName,
      },
    });
  }

  /** All notices still waiting to be shown to `userId`, oldest first — the
   * `IncomingNotifications`-style poller on the client shows them one at a
   * time and dismisses each as it's seen. */
  async listDeclineNotices(userId: string): Promise<DeclineNoticeView[]> {
    const rows = await this.prisma.declineNotice.findMany({
      where: { userId },
      include: { declinedByUser: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      declinedByNickname: row.declinedByUser.nickname,
      roomName: row.roomName,
    }));
  }

  /** Deletes a notice once it's been shown — this table only ever holds
   * undelivered notices, not a permanent log, so "dismiss" and "delete" are
   * the same operation. Silently no-ops if it's already gone (shown twice
   * from two tabs, say) or doesn't belong to this user. */
  async dismissDeclineNotice(userId: string, id: string): Promise<void> {
    await this.prisma.declineNotice.deleteMany({ where: { id, userId } });
  }
}
