import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  getTitleForRating,
  type FriendRelation,
  type FriendRequestView,
  type FriendSearchResult,
  type FriendsListResponse,
  type FriendSuggestion,
  type FriendSuggestionReason,
  type FriendView,
} from '@bible-arena/shared';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { User } from '@prisma/client';
import { TelegramBotService } from '../notifications/telegram-bot.service';
import { PresenceService } from '../presence/presence.service';
import { PrismaService } from '../prisma/prisma.service';

const SEARCH_RESULT_LIMIT = 20;

/**
 * Сколько подсказок показывать. Десять — это экран без прокрутки: список
 * незнакомых имён длиннее просто пролистывают, не читая.
 */
const SUGGESTION_LIMIT = 10;

/**
 * По скольким последним совместным играм ищем знакомых.
 *
 * Без предела список id сессий растёт вместе с историей игрока и целиком
 * уезжает в `IN (...)`. Пятьдесят — это ещё и про смысл: с кем играли
 * позавчера, помнишь, с кем полгода назад — нет.
 */
const RECENT_SESSIONS_LIMIT = 50;

/** Сколько раз каждое значение встретилось. */
function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presenceService: PresenceService,
    private readonly telegramBot: TelegramBotService,
  ) {}

  async search(
    currentUserId: string,
    query: string,
  ): Promise<FriendSearchResult[]> {
    const q = query.trim();
    if (q.length < 2) return [];

    // Child accounts are deliberately harder to find: a partial search
    // ("аня") is how an adult scans for children to approach, while a child
    // adding a classmate types the nickname they were given. So they're
    // reachable by an exact match only — the feature keeps working for the
    // people who already know each other, and stops working as a way to
    // browse for strangers.
    const users = await this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        OR: [
          {
            // `ageBand: { not: 'CHILD' }` alone would be wrong here: it
            // compiles to `ageBand <> 'CHILD'`, which is NULL — not true —
            // for every account that hasn't answered the age question yet,
            // silently dropping all of them out of search. The null case
            // has to be spelled out.
            AND: [
              { OR: [{ ageBand: null }, { ageBand: { not: 'CHILD' } }] },
              { nickname: { not: null, contains: q, mode: 'insensitive' } },
            ],
          },
          { nickname: { equals: q, mode: 'insensitive' } },
        ],
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

    // A stale client (search result for an account since deleted, say)
    // could otherwise reach the upsert below with an id that no longer
    // exists, which fails as a raw foreign-key violation rather than a
    // clean 404.
    const recipientExists = await this.prisma.user.findUnique({
      where: { id: toUserId },
      select: { id: true },
    });
    if (!recipientExists) {
      throw new NotFoundException('Пользователь не найден');
    }

    // Чёрный список действует в обе стороны и проверяется здесь, на
    // сервере, а не только кнопкой в интерфейсе.
    //
    // Интерфейс кнопку прячет (см. `canAddFriend` в списке лидеров и
    // `relation` в поиске), но прятать — не значит запрещать: запрос к
    // `/friends/requests` отправляется в две строки без всякого
    // интерфейса. То есть заблокированный мог и дальше слать заявки тому,
    // кто его заблокировал, — а заявка приходит уведомлением, и блокировка
    // переставала защищать ровно от того, ради чего её и нажимают.
    const ban = await this.prisma.roomBan.findFirst({
      where: {
        OR: [
          { leaderId: currentUserId, bannedUserId: toUserId },
          { leaderId: toUserId, bannedUserId: currentUserId },
        ],
      },
      select: { id: true },
    });
    if (ban) {
      // Одна и та же формулировка в обе стороны намеренно: сообщение «вас
      // заблокировали» рассказало бы отправителю про чужое решение,
      // которое его не касается.
      throw new ForbiddenException('Заявку отправить нельзя');
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

  /**
   * Кого предложить в друзья.
   *
   * ## Зачем это вообще
   *
   * До сих пор нового человека можно было добавить только одним способом —
   * узнать где-то его ник и вбить в поиск. Это работает ровно для тех, кто
   * уже знаком вне приложения, то есть не помогает никому: экран друзей у
   * нового игрока пуст, и остаётся он пустым.
   *
   * ## Откуда берутся кандидаты
   *
   * Два источника, и оба — то, что мы **имеем право** знать, в отличие от
   * контактов Telegram (см. `InviteFriendsCard`):
   *
   * 1. **Уже играли вместе** — сидели в одной дуэли или комнате. Самый
   *    сильный сигнал: человека видели в деле, а не просто рядом.
   * 2. **Общие друзья** — второй круг знакомств.
   *
   * Первый источник бьёт второй: при совпадении показывается «играли
   * вместе», потому что это ближе и понятнее.
   *
   * ## Кого не предлагаем
   *
   * Себя, уже друзей, тех, с кем висит заявка в любую сторону, и обе
   * стороны чёрного списка. Отдельно — детские аккаунты: подсказка это
   * ровно тот способ разглядывать незнакомых людей, от которого их
   * защищает правило поиска, и обходить его через другую дверь нельзя.
   */
  async getSuggestions(currentUserId: string): Promise<FriendSuggestion[]> {
    const [friendships, pendingRequests, bans, mySessions] = await Promise.all([
      this.prisma.friendship.findMany({
        where: { userId: currentUserId },
        select: { friendId: true },
      }),
      this.prisma.friendRequest.findMany({
        where: {
          status: 'PENDING',
          OR: [{ fromUserId: currentUserId }, { toUserId: currentUserId }],
        },
        select: { fromUserId: true, toUserId: true },
      }),
      this.prisma.roomBan.findMany({
        where: {
          OR: [{ leaderId: currentUserId }, { bannedUserId: currentUserId }],
        },
        select: { leaderId: true, bannedUserId: true },
      }),
      this.prisma.gameParticipant.findMany({
        // Соло-игры отсеиваем здесь, а не потом: в них участник один — ты
        // сам, знакомых оттуда взяться неоткуда, а место в лимите они
        // занимают, и у любителя одиночной игры вытеснили бы все дуэли.
        where: { userId: currentUserId, session: { mode: { not: 'SOLO' } } },
        select: { sessionId: true },
        orderBy: { joinedAt: 'desc' },
        take: RECENT_SESSIONS_LIMIT,
      }),
    ]);

    const friendIds = friendships.map((f) => f.friendId);
    const excluded = new Set<string>([currentUserId, ...friendIds]);
    for (const r of pendingRequests) {
      excluded.add(r.fromUserId);
      excluded.add(r.toUserId);
    }
    for (const b of bans) {
      excluded.add(b.leaderId);
      excluded.add(b.bannedUserId);
    }

    const [playedRows, secondCircle] = await Promise.all([
      mySessions.length === 0
        ? Promise.resolve([] as { userId: string }[])
        : this.prisma.gameParticipant.findMany({
            where: {
              sessionId: { in: mySessions.map((s) => s.sessionId) },
              userId: { notIn: [...excluded] },
            },
            select: { userId: true },
          }),
      friendIds.length === 0
        ? Promise.resolve([] as { friendId: string }[])
        : this.prisma.friendship.findMany({
            where: {
              userId: { in: friendIds },
              friendId: { notIn: [...excluded] },
            },
            select: { friendId: true },
          }),
    ]);

    const playedCounts = countBy(playedRows.map((r) => r.userId));
    const mutualCounts = countBy(secondCircle.map((r) => r.friendId));

    const candidateIds = [
      ...new Set([...playedCounts.keys(), ...mutualCounts.keys()]),
    ];
    if (candidateIds.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: {
        id: { in: candidateIds },
        // Без ника человек ещё не игрок: он открыл приложение и бросил
        // онбординг. В подсказках такой аккаунт выглядел безымянной
        // строкой с кнопкой «Добавить» — нашли живой проверкой, по коду
        // это не видно, потому что в поиске `contains` отсекает null сам.
        nickname: { not: null },
        // Та же защита, что и в поиске: детский аккаунт не должен
        // всплывать у незнакомых людей сам по себе.
        OR: [{ ageBand: null }, { ageBand: { not: 'CHILD' } }],
      },
    });
    if (users.length === 0) return [];

    const online = await this.presenceService.areOnline(users.map((u) => u.id));

    return users
      .map((user) => {
        const played = playedCounts.get(user.id) ?? 0;
        const mutual = mutualCounts.get(user.id) ?? 0;
        const reason: FriendSuggestionReason = played > 0 ? 'played' : 'mutual';
        return {
          userId: user.id,
          nickname: user.nickname,
          avatarUrl: user.avatarUrl,
          level: user.level,
          rating: user.rating,
          title: getTitleForRating(user.rating),
          online: online[user.id] ?? false,
          reason,
          count: played > 0 ? played : mutual,
        };
      })
      .sort((a, b) => {
        // Играли вместе — выше общих друзей, потом по силе основания, потом
        // по рейтингу: три уровня, чтобы порядок не «плавал» между
        // запросами при равных счётчиках.
        if (a.reason !== b.reason) return a.reason === 'played' ? -1 : 1;
        if (a.count !== b.count) return b.count - a.count;
        return b.rating - a.rating;
      })
      .slice(0, SUGGESTION_LIMIT);
  }

  /**
   * Личная ссылка-приглашение или `null`, если бот ещё не настроен.
   *
   * Собирается на сервере, а не на клиенте, по одной причине: имя бота знает
   * только сервер — он спрашивает его у самого Telegram по токену. Вынести
   * это на клиент значило бы завести переменную сборки, которую надо не
   * забыть выставить, а забытую заметить только по неработающим ссылкам у
   * игроков.
   *
   * `null` — не ошибка, а состояние «бот не настроен»: кнопка приглашения
   * тогда просто не показывается.
   */
  /**
   * Ссылка-приглашение.
   *
   * ## Почему в ссылке случайный токен, а не `id` пользователя
   *
   * Раньше стоял `id`, и это была дыра. Параметр запуска
   * (`?startapp=...`) приходит от клиента и ничем не подписан: подставить
   * туда можно что угодно. А `linkFromInvite` для **нового** аккаунта
   * создаёт не заявку, а сразу взаимную дружбу — и правильно, потому что
   * ссылку раздаёт сам владелец, и это его согласие.
   *
   * Вместе эти два свойства давали следующее: `id` любого игрока виден в
   * списке лидеров, значит достаточно было завести свежий аккаунт и
   * открыть приложение с `ref_<чужой id>`, чтобы стать другом кого угодно
   * без его ведома — включая ребёнка. А дружба открывает личный чат: он
   * разрешён только друзьям, и это единственная преграда между взрослым и
   * чужим ребёнком в этом приложении.
   *
   * Случайный токен закрывает дыру целиком: подставить чужой нельзя,
   * угадать — тоже. Знание токена и есть согласие пригласившего, потому
   * что узнать его можно только от него самого.
   *
   * ## Почему лениво
   *
   * Ссылка нужна не всем и не всегда, а колонка с уникальным индексом
   * дешевле, когда она заполнена у десятка человек, а не у всех.
   */
  async getInviteLink(currentUserId: string): Promise<string | null> {
    const botUsername = await this.telegramBot.getBotUsername();
    if (!botUsername) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: { inviteToken: true },
    });
    if (!user) return null;

    let token = user.inviteToken;
    if (!token) {
      // 24 байта в base64url — 32 символа, столько же энтропии, сколько у
      // хорошего пароля. Меньше брать нельзя: токен раздаётся открыто и
      // живёт вечно, то есть время на подбор у нападающего не ограничено.
      token = randomBytes(24).toString('base64url');
      await this.prisma.user.update({
        where: { id: currentUserId },
        data: { inviteToken: token },
      });
    }

    return `https://t.me/${botUsername}/app?startapp=ref_${token}`;
  }

  /**
   * Связывает того, кто позвал, с тем, кто пришёл по его ссылке.
   *
   * ## Почему для новичка сразу дружба, а для остальных заявка
   *
   * Новичок оказался в приложении **только** потому, что открыл чью-то
   * ссылку: оба действия осознанны — один отправил, другой открыл. Просить
   * его после этого ещё и подтвердить заявку значит уронить ровно тот шаг,
   * ради которого приглашение и существует: человек заходит и не видит
   * никого, потому что заявка висит у пригласившего.
   *
   * Уже существующему аккаунту дружбу навязывать нельзя: ссылку можно
   * разослать веером или выложить в открытый чат, и тогда «пригласил» — это
   * не знакомство, а рассылка. Ему полагается обычная заявка, которую можно
   * отклонить.
   *
   * ## Почему ошибки не поднимаются наверх
   *
   * Это побочная часть входа, а не его цель. Ссылка может оказаться старой,
   * пригласивший — удалённым, заявка — уже существующей. Ни одно из этого не
   * повод не пустить человека в приложение.
   */
  async linkFromInvite(
    inviteToken: string,
    inviteeId: string,
    inviteeIsNew: boolean,
  ): Promise<void> {
    // Ищем по токену, а не по `id`: `id` виден в списке лидеров и потому
    // подставляется кем угодно, а токен знает только тот, кому его дали.
    // См. `getInviteLink` — там вся история этой правки.
    const inviter = await this.prisma.user.findUnique({
      where: { inviteToken },
      select: { id: true },
    });
    if (!inviter) return;

    const inviterId = inviter.id;
    if (inviterId === inviteeId) return;

    if (!inviteeIsNew) {
      await this.sendRequest(inviterId, inviteeId).catch(() => undefined);
      return;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // Тот же замок на пару, что и у обычной заявки: иначе приглашение и
        // встречная заявка, пришедшие одновременно, оставят половину связи.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${this.pairKey(inviterId, inviteeId)}))`;

        // Дружба хранится двумя строками — по одной с каждой стороны;
        // `upsert` на обе, чтобы повторный переход по ссылке ничего не
        // ломал.
        await tx.friendship.upsert({
          where: {
            userId_friendId: { userId: inviterId, friendId: inviteeId },
          },
          create: { userId: inviterId, friendId: inviteeId },
          update: {},
        });
        await tx.friendship.upsert({
          where: {
            userId_friendId: { userId: inviteeId, friendId: inviterId },
          },
          create: { userId: inviteeId, friendId: inviterId },
          update: {},
        });
      });
    } catch {
      // См. выше: вход важнее связи.
    }
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
