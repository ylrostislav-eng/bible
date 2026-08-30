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

    const [reversePending, alreadyFriends] = await Promise.all([
      this.prisma.friendRequest.findUnique({
        where: {
          fromUserId_toUserId: {
            fromUserId: toUserId,
            toUserId: currentUserId,
          },
        },
      }),
      this.prisma.friendship.findUnique({
        where: {
          userId_friendId: { userId: currentUserId, friendId: toUserId },
        },
      }),
    ]);

    if (alreadyFriends) {
      throw new ConflictException('Вы уже друзья');
    }
    if (reversePending?.status === 'PENDING') {
      await this.acceptRequestRow(reversePending.id);
      return;
    }

    await this.prisma.friendRequest.upsert({
      where: {
        fromUserId_toUserId: { fromUserId: currentUserId, toUserId },
      },
      create: { fromUserId: currentUserId, toUserId },
      update: { status: 'PENDING', createdAt: new Date(), respondedAt: null },
    });
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
    const request = await this.prisma.friendRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.toUserId !== currentUserId) {
      throw new NotFoundException('Заявка в друзья не найдена');
    }
    if (request.status !== 'PENDING') {
      throw new ConflictException('Эта заявка уже обработана');
    }
    await this.acceptRequestRow(requestId);
  }

  private async acceptRequestRow(requestId: string): Promise<void> {
    const request = await this.prisma.friendRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    await this.prisma.$transaction([
      this.prisma.friendRequest.update({
        where: { id: requestId },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      }),
      this.prisma.friendship.upsert({
        where: {
          userId_friendId: {
            userId: request.fromUserId,
            friendId: request.toUserId,
          },
        },
        create: { userId: request.fromUserId, friendId: request.toUserId },
        update: {},
      }),
      this.prisma.friendship.upsert({
        where: {
          userId_friendId: {
            userId: request.toUserId,
            friendId: request.fromUserId,
          },
        },
        create: { userId: request.toUserId, friendId: request.fromUserId },
        update: {},
      }),
    ]);
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
    await this.prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
  }

  async unfriend(currentUserId: string, friendId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.friendship.deleteMany({
        where: { userId: currentUserId, friendId },
      }),
      this.prisma.friendship.deleteMany({
        where: { userId: friendId, friendId: currentUserId },
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
