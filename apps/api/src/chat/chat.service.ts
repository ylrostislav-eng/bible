import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_MESSAGES_PAGE_SIZE,
  type ChatConversationView,
  type ChatMessageView,
  type ChatMessagesPage,
} from '@bible-arena/shared';
import { PresenceService } from '../presence/presence.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presenceService: PresenceService,
  ) {}

  /** Sorted pair of ids — one shared key per friendship regardless of who
   * sent to whom, so a whole thread is a single `where conversationKey = ...`
   * query instead of an OR-across-both-directions one. */
  private conversationKey(a: string, b: string): string {
    return [a, b].sort().join('_');
  }

  /** Messaging is friends-only, and blocked either direction (reusing the
   * same `RoomBan` table the profile blacklist already manages) shuts it
   * down too — a ban is a general "I don't want to hear from this person"
   * signal, not just a room-join block. */
  private async assertCanMessage(
    userId: string,
    otherUserId: string,
  ): Promise<void> {
    if (userId === otherUserId) {
      throw new ForbiddenException('Нельзя написать самому себе');
    }
    const [friendship, ban] = await Promise.all([
      this.prisma.friendship.findUnique({
        where: { userId_friendId: { userId, friendId: otherUserId } },
      }),
      this.prisma.roomBan.findFirst({
        where: {
          OR: [
            { leaderId: userId, bannedUserId: otherUserId },
            { leaderId: otherUserId, bannedUserId: userId },
          ],
        },
      }),
    ]);
    if (!friendship) {
      throw new ForbiddenException('Писать можно только друзьям');
    }
    if (ban) {
      throw new ForbiddenException(
        'Переписка недоступна — пользователь заблокирован',
      );
    }
  }

  async sendMessage(
    senderId: string,
    recipientId: string,
    body: string,
  ): Promise<ChatMessageView> {
    await this.assertCanMessage(senderId, recipientId);
    // Length is enforced here rather than as a DTO on the transport: sending
    // goes through the WebSocket gateway, whose handler took a raw object
    // and never ran the validation class that existed for it — so the limit
    // the chat UI shows was, in practice, only a client-side courtesy.
    // Checking in the service covers every caller, whatever the transport.
    if (typeof body !== 'string') {
      throw new BadRequestException('Некорректное сообщение');
    }
    const trimmed = body.trim();
    if (!trimmed) {
      throw new ForbiddenException('Сообщение не может быть пустым');
    }
    if (trimmed.length > CHAT_MESSAGE_MAX_LENGTH) {
      throw new BadRequestException(
        `Слишком длинное сообщение (максимум ${CHAT_MESSAGE_MAX_LENGTH} символов)`,
      );
    }
    const message = await this.prisma.chatMessage.create({
      data: {
        conversationKey: this.conversationKey(senderId, recipientId),
        senderId,
        recipientId,
        body: trimmed,
      },
    });
    return this.toView(message);
  }

  async getMessages(
    userId: string,
    friendId: string,
    before: string | undefined,
    limit: number = CHAT_MESSAGES_PAGE_SIZE,
  ): Promise<ChatMessagesPage> {
    await this.assertCanMessage(userId, friendId);
    const key = this.conversationKey(userId, friendId);

    const rows = await this.prisma.chatMessage.findMany({
      where: { conversationKey: key },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    // Only the "live" end of the thread (no cursor, i.e. the newest page)
    // marks messages read — paging back through history you've already
    // seen shouldn't re-touch anything.
    if (!before) {
      await this.prisma.chatMessage.updateMany({
        where: { conversationKey: key, recipientId: userId, readAt: null },
        data: { readAt: new Date() },
      });
    }

    return {
      messages: page.reverse().map((m) => this.toView(m)),
      nextCursor: hasMore ? page[0].id : null,
    };
  }

  async getConversations(userId: string): Promise<ChatConversationView[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: { userId },
      select: { friendId: true },
    });
    const friendIds = friendships.map((f) => f.friendId);
    if (friendIds.length === 0) return [];

    const conversationKeys = friendIds.map((friendId) =>
      this.conversationKey(userId, friendId),
    );

    const [friends, online, lastMessages, unreadGroups] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: friendIds } } }),
      this.presenceService.areOnline(friendIds),
      // One query for every conversation's latest message instead of one
      // query per friend. `DISTINCT ON` (paired with a matching `ORDER BY`)
      // is Postgres's idiomatic "last row per group", and the existing
      // (conversationKey, createdAt) index turns this into a fast index
      // scan rather than a full table scan. At a few hundred friends the
      // old one-query-per-friend loop was slow enough to visibly stall the
      // conversation list — and held up the whole DB connection pool for
      // everyone else mid-request, not just this one caller.
      this.prisma.$queryRaw<
        {
          conversationKey: string;
          senderId: string;
          body: string;
          createdAt: Date;
        }[]
      >`
        SELECT DISTINCT ON ("conversationKey") "conversationKey", "senderId", "body", "createdAt"
        FROM "chat_messages"
        WHERE "conversationKey" = ANY(${conversationKeys})
        ORDER BY "conversationKey", "createdAt" DESC
      `,
      this.prisma.chatMessage.groupBy({
        by: ['senderId'],
        where: {
          recipientId: userId,
          senderId: { in: friendIds },
          readAt: null,
        },
        _count: { _all: true },
      }),
    ]);

    const lastByKey = new Map(lastMessages.map((m) => [m.conversationKey, m]));
    const lastByFriend = new Map(
      friendIds.map((friendId) => [
        friendId,
        lastByKey.get(this.conversationKey(userId, friendId)) ?? null,
      ]),
    );
    const unreadByFriend = new Map(
      unreadGroups.map((g) => [g.senderId, g._count._all]),
    );
    const friendById = new Map(friends.map((f) => [f.id, f]));

    return friendIds
      .map((friendId): ChatConversationView | null => {
        const friend = friendById.get(friendId);
        if (!friend) return null;
        const last = lastByFriend.get(friendId) ?? null;
        return {
          friendUserId: friendId,
          nickname: friend.nickname,
          avatarUrl: friend.avatarUrl,
          online: online[friendId] ?? false,
          lastMessage: last
            ? {
                body: last.body,
                createdAt: last.createdAt.toISOString(),
                fromMe: last.senderId === userId,
              }
            : null,
          unreadCount: unreadByFriend.get(friendId) ?? 0,
        };
      })
      .filter((c): c is ChatConversationView => c !== null)
      .sort((a, b) => {
        const aTime = a.lastMessage ? Date.parse(a.lastMessage.createdAt) : 0;
        const bTime = b.lastMessage ? Date.parse(b.lastMessage.createdAt) : 0;
        return bTime - aTime;
      });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.chatMessage.count({
      where: { recipientId: userId, readAt: null },
    });
  }

  private toView(message: {
    id: string;
    senderId: string;
    body: string;
    createdAt: Date;
    readAt: Date | null;
  }): ChatMessageView {
    return {
      id: message.id,
      fromUserId: message.senderId,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      readAt: message.readAt ? message.readAt.toISOString() : null,
    };
  }
}
