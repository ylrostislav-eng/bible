import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  getTitleForRating,
  type FriendRelation,
  type FriendRequestView,
  type FriendSearchResult,
  type FriendsListResponse,
  type FriendView,
} from '@bible-arena/shared';
import { Prisma } from '@prisma/client';
import type { User } from '@prisma/client';
import { PresenceService } from '../presence/presence.service';
import { PrismaService } from '../prisma/prisma.service';

const SEARCH_RESULT_LIMIT = 20;

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presenceService: PresenceService,
  ) {}

  async search(
    currentUserId: string,
    query: string,
  ): Promise<FriendSearchResult[]> {
    const q = query.trim();
    if (q.length < 2) return [];

    const users = await this.prisma.user.findMany({
      where: {
        nickname: { not: null, contains: q, mode: 'insensitive' },
        id: { not: currentUserId },
      },
      take: SEARCH_RESULT_LIMIT,
      orderBy: { rating: 'desc' },
    });
    if (users.length === 0) return [];

    const [friendIds, requests] = await Promise.all([
      this.prisma.friendship
        .findMany({
          where: { userId: currentUserId },
          select: { friendId: true },
        })
        .then((rows) => new Set(rows.map((r) => r.friendId))),
      this.prisma.friendRequest.findMany({
        where: {
          status: 'PENDING',
          OR: [
            {
              fromUserId: currentUserId,
              toUserId: { in: users.map((u) => u.id) },
            },
            {
              toUserId: currentUserId,
              fromUserId: { in: users.map((u) => u.id) },
            },
          ],
        },
      }),
    ]);
    const outgoingTo = new Set(
      requests
        .filter((r) => r.fromUserId === currentUserId)
        .map((r) => r.toUserId),
    );
    const incomingFrom = new Set(
      requests
        .filter((r) => r.toUserId === currentUserId)
        .map((r) => r.fromUserId),
    );

    return users.map((user) => ({
      userId: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      level: user.level,
      rating: user.rating,
      title: getTitleForRating(user.rating),
      relation: this.relationFor(user.id, {
        friendIds,
        outgoingTo,
        incomingFrom,
      }),
    }));
  }

  private relationFor(
    userId: string,
    sets: {
      friendIds: Set<string>;
      outgoingTo: Set<string>;
      incomingFrom: Set<string>;
    },
  ): FriendRelation {
    if (sets.friendIds.has(userId)) return 'friend';
    if (sets.outgoingTo.has(userId)) return 'outgoing';
    if (sets.incomingFrom.has(userId)) return 'incoming';
    return 'none';
  }

  /**
   * Creates a pending request — unless the other person already sent one
   * to us, in which case this call just accepts theirs instead of leaving
   * two redundant pending requests crossing each other.
   */
  async sendRequest(currentUserId: string, toUserId: string): Promise<void> {
    if (toUserId === currentUserId) {
      throw new BadRequestException('Нельзя добавить себя в друзья');
    }

    // Everything runs under an advisory lock keyed on the *pair* of users
    // (same trick as the room-name uniqueness check in RoomsService). Two
    // people adding each other at the same moment would otherwise both read
    // "no request from them yet" and both create one, leaving two pending
    // requests crossing each other — exactly what the reverse-pending
    // branch below exists to prevent.
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${this.pairKey(currentUserId, toUserId)}))`;

      const [reversePending, alreadyFriends] = await Promise.all([
        tx.friendRequest.findUnique({
          where: {
            fromUserId_toUserId: {
              fromUserId: toUserId,
              toUserId: currentUserId,
            },
          },
        }),
        tx.friendship.findUnique({
          where: {
            userId_friendId: { userId: currentUserId, friendId: toUserId },
          },
        }),
      ]);

      if (alreadyFriends) {
        throw new ConflictException('Вы уже друзья');
      }
      if (reversePending?.status === 'PENDING') {
        await this.acceptRequestRow(tx, reversePending.id);
        return;
      }

      await tx.friendRequest.upsert({
        where: {
          fromUserId_toUserId: { fromUserId: currentUserId, toUserId },
        },
        create: { fromUserId: currentUserId, toUserId },
        update: { status: 'PENDING', createdAt: new Date(), respondedAt: null },
      });
    });
  }

  /** Stable key for a pair of users regardless of direction — the lock a
   * request between these two takes, so both directions serialize. */
  private pairKey(a: string, b: string): string {
    return [a, b].sort().join('_');
  }

  async listRequests(currentUserId: string): Promise<{
    incoming: FriendRequestView[];
    outgoing: FriendRequestView[];
  }> {
    const [incoming, outgoing] = await Promise.all([
      this.prisma.friendRequest.findMany({
        where: { toUserId: currentUserId, status: 'PENDING' },
        include: { fromUser: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.friendRequest.findMany({
        where: { fromUserId: currentUserId, status: 'PENDING' },
        include: { toUser: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      incoming: incoming.map((r) =>
        this.toRequestView(r.id, r.fromUser, r.createdAt),
      ),
      outgoing: outgoing.map((r) =>
        this.toRequestView(r.id, r.toUser, r.createdAt),
      ),
    };
  }

  private toRequestView(
    requestId: string,
    otherUser: User,
    createdAt: Date,
  ): FriendRequestView {
    return {
      id: requestId,
      userId: otherUser.id,
      nickname: otherUser.nickname,
      avatarUrl: otherUser.avatarUrl,
      level: otherUser.level,
      rating: otherUser.rating,
      title: getTitleForRating(otherUser.rating),
      createdAt: createdAt.toISOString(),
    };
  }

  async acceptRequest(currentUserId: string, requestId: string): Promise<void> {
    // The read is only for telling the two failure cases apart ("not your
    // request" vs "already handled") — the real guard is the atomic claim
    // inside `acceptRequestRow`.
    const request = await this.prisma.friendRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.toUserId !== currentUserId) {
      throw new NotFoundException('Заявка в друзья не найдена');
    }
    if (request.status !== 'PENDING') {
      throw new ConflictException('Эта заявка уже обработана');
    }

    const accepted = await this.prisma.$transaction((tx) =>
      this.acceptRequestRow(tx, requestId),
    );
    if (!accepted) {
      throw new ConflictException('Эта заявка уже обработана');
    }
  }

  /**
   * Flips a pending request to ACCEPTED and creates both halves of the
   * friendship, all in the caller's transaction. Returns `false` if the
   * request was no longer pending — the conditional `updateMany` is what
   * makes that check atomic: accepting and declining the same request at
   * the same moment would otherwise both pass a plain status check, and
   * the pair could end up recorded as DECLINED while the friendship rows
   * had already been written.
   */
  private async acceptRequestRow(
    tx: Prisma.TransactionClient,
    requestId: string,
  ): Promise<boolean> {
    const claim = await tx.friendRequest.updateMany({
      where: { id: requestId, status: 'PENDING' },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
    });
    if (claim.count === 0) {
      return false;
    }

    const request = await tx.friendRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    await tx.friendship.upsert({
      where: {
        userId_friendId: {
          userId: request.fromUserId,
          friendId: request.toUserId,
        },
      },
      create: { userId: request.fromUserId, friendId: request.toUserId },
      update: {},
    });
    await tx.friendship.upsert({
      where: {
        userId_friendId: {
          userId: request.toUserId,
          friendId: request.fromUserId,
        },
      },
      create: { userId: request.toUserId, friendId: request.fromUserId },
      update: {},
    });
    return true;
  }

  async declineRequest(
    currentUserId: string,
    requestId: string,
  ): Promise<void> {
    const request = await this.prisma.friendRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.toUserId !== currentUserId) {
      throw new NotFoundException('Заявка в друзья не найдена');
    }
    if (request.status !== 'PENDING') {
      throw new ConflictException('Эта заявка уже обработана');
    }

    // Conditional claim for the same reason as accepting — whichever of a
    // racing accept/decline pair gets here second must lose cleanly rather
    // than overwrite the other's outcome.
    const claim = await this.prisma.friendRequest.updateMany({
      where: { id: requestId, status: 'PENDING' },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
    if (claim.count === 0) {
      throw new ConflictException('Эта заявка уже обработана');
    }
  }

  async unfriend(currentUserId: string, friendId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.friendship.deleteMany({
        where: { userId: currentUserId, friendId },
      }),
      this.prisma.friendship.deleteMany({
        where: { userId: friendId, friendId: currentUserId },
      }),
      // Once unfriended, `ChatService.assertCanMessage` requires an active
      // friendship, so this conversation becomes permanently unreachable —
      // neither side can open it again to mark anything read. Any message
      // still sitting unread at this exact moment would otherwise keep
      // counting toward the recipient's unread badge forever, with no way
      // for them to ever clear it.
      this.prisma.chatMessage.updateMany({
        where: {
          readAt: null,
          OR: [
            { senderId: currentUserId, recipientId: friendId },
            { senderId: friendId, recipientId: currentUserId },
          ],
        },
        data: { readAt: new Date() },
      }),
    ]);
  }

  async getOverview(currentUserId: string): Promise<FriendsListResponse> {
    const [friendships, requests] = await Promise.all([
      this.prisma.friendship.findMany({
        where: { userId: currentUserId },
        select: { friendId: true },
      }),
      this.listRequests(currentUserId),
    ]);

    const friendUsers = await this.prisma.user.findMany({
      where: { id: { in: friendships.map((f) => f.friendId) } },
    });
    const online = await this.presenceService.areOnline(
      friendUsers.map((u) => u.id),
    );

    const friends: FriendView[] = friendUsers
      .map((user) => ({
        userId: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        level: user.level,
        rating: user.rating,
        title: getTitleForRating(user.rating),
        online: online[user.id] ?? false,
      }))
      // Online friends first, then alphabetical-ish by rating so the list
      // doesn't visibly jump around between fetches.
      .sort(
        (a, b) => Number(b.online) - Number(a.online) || b.rating - a.rating,
      );

    return {
      friends,
      incomingRequests: requests.incoming,
      outgoingRequests: requests.outgoing,
    };
  }
}
