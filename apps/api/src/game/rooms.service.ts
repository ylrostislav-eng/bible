import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ROOM_INTRO_TOTAL_MS,
  ROOM_MAX_PARTICIPANTS,
  ROOM_MIN_PARTICIPANTS_FOR_RATING,
  getTitleForRating,
  type BannedUserView,
  type CreateRoomResponse,
  type JoinRoomResponse,
  type RoomInviteView,
  type RoomParticipantView,
  type RoomState,
  type RoomStateStatus,
  type RoomSummary,
} from '@bible-arena/shared';
import { Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import type { CreateRoomDto } from './dto/create-room.dto';
import type { JoinRoomDto } from './dto/join-room.dto';
import type { RoomAnswerDto } from './dto/room-answer.dto';
import { toPublicQuestion } from './game.mapper';
import {
  COINS_PER_CORRECT_ANSWER,
  XP_PER_CORRECT_ANSWER,
} from './game.service';
import { generateInviteCode } from './invite-code';
import { QuestionsService, shuffleOptions } from './questions.service';
import { generateRoomPassword } from './room-password';

const CREATE_CODE_ATTEMPTS = 5;
const CREATE_PASSWORD_ATTEMPTS = 5;

/** Best rank's reward, scaled by room size — a bigger room's win is worth
 * more, capped so it never dwarfs the effort of a small one. */
const ROOM_TOP_REWARD_CAP = 20;
/** Last place's reward — always a mild penalty, regardless of room size. */
const ROOM_LAST_PENALTY = -5;
/** Overrides the rank-based reward for a participant who got every question
 * wrong — always a real penalty, matching the 1v1 duel's equivalent rule. */
const ROOM_ZERO_CORRECT_RATING_DELTA = -10;

function topReward(participantCount: number): number {
  return Math.min(ROOM_TOP_REWARD_CAP, 10 + Math.floor(participantCount / 2));
}

const roomSessionInclude = {
  participants: {
    include: {
      user: true,
      answers: { include: { question: true }, orderBy: { order: 'asc' } },
    },
    orderBy: { joinedAt: 'asc' },
  },
} satisfies Prisma.GameSessionInclude;

type LoadedRoom = Prisma.GameSessionGetPayload<{
  include: typeof roomSessionInclude;
}>;
type LoadedRoomParticipant = LoadedRoom['participants'][number];
type LoadedRoomAnswer = LoadedRoomParticipant['answers'][number];

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questionsService: QuestionsService,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    userId: string,
    dto: CreateRoomDto,
  ): Promise<CreateRoomResponse> {
    const maxParticipants = Math.min(
      dto.maxParticipants ?? ROOM_MAX_PARTICIPANTS,
      ROOM_MAX_PARTICIPANTS,
    );
    const roomName = dto.roomName.trim();
    if (!roomName) {
      throw new BadRequestException('Введите название комнаты');
    }

    let password: string | null = null;
    if (dto.visibility === 'PRIVATE') {
      password = await this.generateUniquePassword();
    }

    // The whole name-uniqueness check + create runs inside one transaction,
    // guarded by an advisory lock scoped to this name — a plain
    // findFirst-then-create (outside a transaction, or without the lock)
    // would let two concurrent requests for the same name both pass the
    // check before either commits, defeating the point of the check.
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${roomName.toLowerCase()}))`;

      const existing = await tx.gameSession.findFirst({
        where: {
          mode: 'ROOM',
          // COMPLETED rooms don't count — their name is free to reuse once
          // they're done, only currently-open/ongoing ones would actually
          // be confusing to have a duplicate of.
          status: { in: ['LOBBY', 'IN_PROGRESS'] },
          roomName: { equals: roomName, mode: 'insensitive' },
        },
      });
      if (existing) {
        throw new ConflictException(
          'Комната с таким названием уже существует — выберите другое',
        );
      }

      for (let attempt = 0; attempt < CREATE_CODE_ATTEMPTS; attempt++) {
        const inviteCode = generateInviteCode();
        try {
          const session = await tx.gameSession.create({
            data: {
              mode: 'ROOM',
              status: 'LOBBY',
              questionCount: dto.questionCount,
              inviteCode,
              roomName,
              visibility: dto.visibility,
              password,
              leaderId: userId,
              maxParticipants,
              participants: { create: { userId, isLeader: true } },
            },
          });
          return { sessionId: session.id, inviteCode, password };
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            continue;
          }
          throw error;
        }
      }
      throw new ConflictException(
        'Не удалось создать комнату, попробуйте ещё раз',
      );
    });
  }

  /** Generates a password that doesn't collide with any other currently
   * joinable PRIVATE room's password — retried like the invite code, but
   * checked at the application level since a password isn't itself a unique
   * lookup key (the invite code is). */
  private async generateUniquePassword(): Promise<string> {
    for (let attempt = 0; attempt < CREATE_PASSWORD_ATTEMPTS; attempt++) {
      const password = generateRoomPassword();
      const collision = await this.prisma.gameSession.findFirst({
        where: {
          mode: 'ROOM',
          visibility: 'PRIVATE',
          status: { in: ['LOBBY', 'IN_PROGRESS'] },
          password,
        },
        select: { id: true },
      });
      if (!collision) return password;
    }
    return generateRoomPassword();
  }

  /** Public, joinable (not full) rooms still accepting players. */
  async listPublic(): Promise<RoomSummary[]> {
    const sessions = await this.prisma.gameSession.findMany({
      where: { mode: 'ROOM', status: 'LOBBY', visibility: 'PUBLIC' },
      include: { participants: { include: { user: true } } },
      orderBy: { startedAt: 'desc' },
      take: 30,
    });

    return sessions
      .filter(
        (s) =>
          s.participants.length < (s.maxParticipants ?? ROOM_MAX_PARTICIPANTS),
      )
      .map((s) => ({
        sessionId: s.id,
        inviteCode: s.inviteCode ?? '',
        roomName: s.roomName,
        leaderNickname:
          s.participants.find((p) => p.userId === s.leaderId)?.user.nickname ??
          null,
        participantCount: s.participants.length,
        maxParticipants: s.maxParticipants ?? ROOM_MAX_PARTICIPANTS,
        questionCount: s.questionCount,
      }));
  }

  async join(userId: string, dto: JoinRoomDto): Promise<JoinRoomResponse> {
    const found = await this.prisma.gameSession.findUnique({
      where: { inviteCode: dto.inviteCode.toUpperCase() },
      select: { id: true, mode: true },
    });
    if (!found || found.mode !== 'ROOM') {
      throw new NotFoundException('Комната с таким кодом не найдена');
    }

    return this.withSessionLock(found.id, async (tx) => {
      const session = await tx.gameSession.findUnique({
        where: { id: found.id },
        include: roomSessionInclude,
      });
      if (!session) {
        throw new NotFoundException('Комната с таким кодом не найдена');
      }
      if (session.status !== 'LOBBY') {
        throw new ConflictException('Эта комната уже началась или завершена');
      }
      if (session.participants.some((p) => p.userId === userId)) {
        throw new ConflictException('Вы уже в этой комнате');
      }
      if (
        session.participants.length >=
        (session.maxParticipants ?? ROOM_MAX_PARTICIPANTS)
      ) {
        throw new ConflictException('Комната заполнена');
      }
      if (session.visibility === 'PRIVATE') {
        if (!dto.password || dto.password.toUpperCase() !== session.password) {
          throw new BadRequestException('Неверный пароль комнаты');
        }
      }
      if (session.leaderId) {
        const ban = await tx.roomBan.findUnique({
          where: {
            leaderId_bannedUserId: {
              leaderId: session.leaderId,
              bannedUserId: userId,
            },
          },
        });
        if (ban) {
          throw new ForbiddenException(
            'Лидер этой комнаты заблокировал вас в своих комнатах',
          );
        }
      }

      await tx.gameParticipant.create({
        data: { sessionId: session.id, userId },
      });

      return { sessionId: session.id };
    });
  }

  async getState(userId: string, sessionId: string): Promise<RoomState> {
    const session = await this.loadSession(sessionId);
    this.requireParticipant(session, userId);
    return this.buildState(session, userId);
  }

  async setReady(
    userId: string,
    sessionId: string,
    ready: boolean,
  ): Promise<RoomState> {
    const session = await this.loadSession(sessionId);
    const participant = this.requireParticipant(session, userId);
    if (session.status !== 'LOBBY') {
      throw new ConflictException('Комната уже начала игру');
    }

    await this.prisma.gameParticipant.update({
      where: { id: participant.id },
      data: { isReady: ready },
    });

    return this.buildState(await this.loadSession(sessionId), userId);
  }

  /** Leader-only. Only meaningful in LOBBY — a running or finished room has
   * no server-side "leave" concept, same as the 1v1 duel: a participant who
   * disappears simply stops answering and their misses auto-resolve via the
   * per-question timer. */
  async kick(
    leaderId: string,
    sessionId: string,
    targetUserId: string,
  ): Promise<RoomState> {
    const session = await this.loadSession(sessionId);
    this.requireLeader(session, leaderId);
    if (targetUserId === leaderId) {
      throw new BadRequestException('Нельзя исключить самого себя');
    }
    if (session.status !== 'LOBBY') {
      throw new ConflictException('Комната уже начала игру');
    }

    const target = session.participants.find((p) => p.userId === targetUserId);
    if (!target) {
      throw new NotFoundException('Участник не найден в этой комнате');
    }
    await this.prisma.gameParticipant.delete({ where: { id: target.id } });

    return this.buildState(await this.loadSession(sessionId), leaderId);
  }

  /** Kicks (if still present) and permanently blocks the target from
   * joining any future room led by this leader. Independent of `kick` —
   * a leader can ban without the target currently being in this room. */
  async ban(
    leaderId: string,
    sessionId: string,
    targetUserId: string,
  ): Promise<RoomState> {
    const session = await this.loadSession(sessionId);
    this.requireLeader(session, leaderId);
    if (targetUserId === leaderId) {
      throw new BadRequestException('Нельзя заблокировать самого себя');
    }

    await this.prisma.roomBan.upsert({
      where: {
        leaderId_bannedUserId: { leaderId, bannedUserId: targetUserId },
      },
      create: { leaderId, bannedUserId: targetUserId },
      update: {},
    });
    await this.reconcileUnreadOnBan(leaderId, targetUserId);

    const target = session.participants.find((p) => p.userId === targetUserId);
    if (target && session.status === 'LOBBY') {
      await this.prisma.gameParticipant.delete({ where: { id: target.id } });
    }

    return this.buildState(await this.loadSession(sessionId), leaderId);
  }

  /** Same fix as `FriendsService.unfriend`, for the other way a
   * conversation can become permanently unreachable: `ChatService`'s ban
   * check is direction-agnostic, so banning someone shuts down messaging
   * both ways just like unfriending does — any message still unread at
   * that moment would otherwise stay stuck on the recipient's unread badge
   * forever, with the conversation now impossible to open and clear it. */
  private async reconcileUnreadOnBan(
    leaderId: string,
    bannedUserId: string,
  ): Promise<void> {
    await this.prisma.chatMessage.updateMany({
      where: {
        readAt: null,
        OR: [
          { senderId: leaderId, recipientId: bannedUserId },
          { senderId: bannedUserId, recipientId: leaderId },
        ],
      },
      data: { readAt: new Date() },
    });
  }

  /** Standalone leader-scoped ban, independent of any specific room — the
   * profile's blacklist screen uses this to pre-emptively block someone who
   * isn't (or isn't yet) sitting in any of this leader's rooms. Idempotent:
   * banning an already-banned user is a no-op, not an error. */
  async banUser(leaderId: string, targetUserId: string): Promise<void> {
    if (targetUserId === leaderId) {
      throw new BadRequestException('Нельзя заблокировать самого себя');
    }
    await this.prisma.roomBan.upsert({
      where: {
        leaderId_bannedUserId: { leaderId, bannedUserId: targetUserId },
      },
      create: { leaderId, bannedUserId: targetUserId },
      update: {},
    });
    await this.reconcileUnreadOnBan(leaderId, targetUserId);
  }

  /** Lets the target join this leader's rooms again. Existing rooms are
   * unaffected either way — a ban only ever blocks future joins. */
  async unbanUser(leaderId: string, targetUserId: string): Promise<void> {
    await this.prisma.roomBan.deleteMany({
      where: { leaderId, bannedUserId: targetUserId },
    });
  }

  async listBanned(leaderId: string): Promise<BannedUserView[]> {
    const bans = await this.prisma.roomBan.findMany({
      where: { leaderId },
      include: { bannedUser: true },
      orderBy: { createdAt: 'desc' },
    });
    return bans.map((b) => ({
      userId: b.bannedUser.id,
      nickname: b.bannedUser.nickname,
      avatarUrl: b.bannedUser.avatarUrl,
      level: b.bannedUser.level,
      rating: b.bannedUser.rating,
      title: getTitleForRating(b.bannedUser.rating),
      bannedAt: b.createdAt.toISOString(),
    }));
  }

  // ---- friend invites (leader picks a friend from the lobby to join this
  // specific room — distinct from the generic invite code/password anyone
  // can use) ----

  /** Leader-only, LOBBY-only. Upserts rather than erroring on a repeat
   * invite to the same friend — clicking "Пригласить" again is a harmless
   * no-op, not a mistake worth surfacing. */
  async invite(
    leaderId: string,
    sessionId: string,
    targetUserId: string,
  ): Promise<void> {
    const session = await this.loadSession(sessionId);
    this.requireLeader(session, leaderId);
    if (session.status !== 'LOBBY') {
      throw new ConflictException(
        'Комната уже началась — приглашать больше нельзя',
      );
    }
    if (targetUserId === leaderId) {
      throw new BadRequestException('Нельзя пригласить самого себя');
    }
    if (session.participants.some((p) => p.userId === targetUserId)) {
      throw new ConflictException('Этот игрок уже в комнате');
    }

    const friendship = await this.prisma.friendship.findUnique({
      where: { userId_friendId: { userId: leaderId, friendId: targetUserId } },
    });
    if (!friendship) {
      throw new ConflictException('Приглашать можно только друзей');
    }
    // Same "don't let this person reach me" block as the duel challenge —
    // the target having banned the leader blocks the invite outright.
    const ban = await this.prisma.roomBan.findUnique({
      where: {
        leaderId_bannedUserId: {
          leaderId: targetUserId,
          bannedUserId: leaderId,
        },
      },
    });
    if (ban) {
      throw new ForbiddenException('Этот игрок заблокировал вас');
    }

    await this.prisma.roomInvite.upsert({
      where: { sessionId_toUserId: { sessionId, toUserId: targetUserId } },
      create: { sessionId, fromUserId: leaderId, toUserId: targetUserId },
      update: {},
    });
  }

  /** Every pending invite addressed to this user, for rooms still in
   * LOBBY — surfaced on the room menu screen so they can join with one tap. */
  async listPendingInvites(userId: string): Promise<RoomInviteView[]> {
    const invites = await this.prisma.roomInvite.findMany({
      where: { toUserId: userId, session: { status: 'LOBBY' } },
      include: {
        session: { include: { participants: true } },
        fromUser: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return invites.map((invite) => ({
      inviteId: invite.id,
      sessionId: invite.sessionId,
      roomName: invite.session.roomName,
      fromNickname: invite.fromUser.nickname,
      participantCount: invite.session.participants.length,
      maxParticipants: invite.session.maxParticipants ?? ROOM_MAX_PARTICIPANTS,
      questionCount: invite.session.questionCount,
      createdAt: invite.createdAt.toISOString(),
    }));
  }

  /** Joins directly — no code or password needed, since a personal invite
   * from the leader already establishes the intent both ways. Re-checks
   * capacity/ban regardless: either could have changed between the invite
   * being sent and this being accepted. */
  async acceptInvite(
    userId: string,
    inviteId: string,
  ): Promise<JoinRoomResponse> {
    const invite = await this.prisma.roomInvite.findUnique({
      where: { id: inviteId },
    });
    if (!invite || invite.toUserId !== userId) {
      throw new NotFoundException('Приглашение не найдено');
    }

    // Everything from here is locked on the session row so the capacity
    // check and the participant insert happen atomically (see `join`'s
    // comment) — a plain read-then-write let two people accepting invites
    // to the same room's last seat both slip past the capacity check.
    // Failure branches return a tag rather than throwing directly: throwing
    // inside the transaction would roll back the invite deletion that
    // branch just made, un-doing the very cleanup it was trying to do.
    const result = await this.withSessionLock(invite.sessionId, async (tx) => {
      const session = await tx.gameSession.findUnique({
        where: { id: invite.sessionId },
        include: roomSessionInclude,
      });
      if (!session || session.mode !== 'ROOM') {
        return { ok: false as const, error: 'not-found' as const };
      }
      if (session.status !== 'LOBBY') {
        await tx.roomInvite.deleteMany({ where: { sessionId: session.id } });
        return { ok: false as const, error: 'started' as const };
      }
      if (session.participants.some((p) => p.userId === userId)) {
        await tx.roomInvite.delete({ where: { id: inviteId } });
        return { ok: false as const, error: 'already-in' as const };
      }
      if (
        session.participants.length >=
        (session.maxParticipants ?? ROOM_MAX_PARTICIPANTS)
      ) {
        // Deliberately doesn't delete the invite — unlike the other failure
        // branches above, this one can resolve itself (someone else leaves
        // before the game starts), so the invite should stay valid for a retry.
        return { ok: false as const, error: 'full' as const };
      }
      if (session.leaderId) {
        const ban = await tx.roomBan.findUnique({
          where: {
            leaderId_bannedUserId: {
              leaderId: session.leaderId,
              bannedUserId: userId,
            },
          },
        });
        if (ban) {
          await tx.roomInvite.delete({ where: { id: inviteId } });
          return { ok: false as const, error: 'banned' as const };
        }
      }

      await tx.gameParticipant.create({
        data: { sessionId: session.id, userId },
      });
      await tx.roomInvite.delete({ where: { id: inviteId } });
      return { ok: true as const, sessionId: session.id };
    });

    if (!result.ok) {
      switch (result.error) {
        case 'not-found':
          throw new NotFoundException('Комната не найдена');
        case 'started':
          throw new ConflictException('Эта комната уже началась или завершена');
        case 'already-in':
          throw new ConflictException('Вы уже в этой комнате');
        case 'full':
          throw new ConflictException(
            'Комната уже заполнена. Присоединиться получится, если до начала игры освободится место',
          );
        case 'banned':
          throw new ForbiddenException(
            'Лидер этой комнаты заблокировал вас в своих комнатах',
          );
      }
    }

    return { sessionId: result.sessionId };
  }

  async declineInvite(userId: string, inviteId: string): Promise<void> {
    const invite = await this.prisma.roomInvite.findUnique({
      where: { id: inviteId },
      include: { session: { select: { roomName: true } } },
    });
    if (!invite || invite.toUserId !== userId) {
      throw new NotFoundException('Приглашение не найдено');
    }
    await this.prisma.roomInvite.delete({ where: { id: inviteId } });
    // A personal invite, unlike the public room list — the leader singled
    // this person out, so a silent "it just disappeared" isn't enough.
    await this.notificationsService.recordRoomInviteDecline({
      userId: invite.fromUserId,
      declinedByUserId: userId,
      roomName: invite.session.roomName,
    });
  }

  /** LOBBY-only. The leader leaving closes the room only if they were the
   * last one in it — otherwise leadership passes to whoever joined earliest
   * among those remaining, so the rest of the room isn't kicked out just
   * because the leader moved on (e.g. to accept a different invite
   * elsewhere — see `RoomsController.leave`). */
  async leave(userId: string, sessionId: string): Promise<RoomState | null> {
    const session = await this.loadSession(sessionId);
    const participant = this.requireParticipant(session, userId);
    if (session.status !== 'LOBBY') {
      return this.buildState(session, userId);
    }

    if (session.leaderId === userId) {
      const others = session.participants.filter((p) => p.userId !== userId);
      if (others.length === 0) {
        await this.prisma.gameSession.update({
          where: { id: sessionId },
          data: { status: 'ABANDONED', finishedAt: new Date() },
        });
        // No one still holds a pending invite to a room that no longer exists.
        await this.prisma.roomInvite.deleteMany({ where: { sessionId } });
        return null;
      }

      // `roomSessionInclude` orders participants by `joinedAt` ascending, so
      // the first of the rest is whoever has been waiting longest.
      const nextLeader = others[0];
      await this.prisma.$transaction([
        this.prisma.gameSession.update({
          where: { id: sessionId },
          data: { leaderId: nextLeader.userId },
        }),
        this.prisma.gameParticipant.update({
          where: { id: nextLeader.id },
          data: { isLeader: true },
        }),
        this.prisma.gameParticipant.delete({ where: { id: participant.id } }),
      ]);
      return this.buildState(
        await this.loadSession(sessionId),
        nextLeader.userId,
      );
    }

    await this.prisma.gameParticipant.delete({ where: { id: participant.id } });
    return this.buildState(await this.loadSession(sessionId), userId);
  }

  /** Leader-only. Requires every non-leader participant to be ready. */
  async start(leaderId: string, sessionId: string): Promise<RoomState> {
    const session = await this.loadSession(sessionId);
    this.requireLeader(session, leaderId);
    if (session.status !== 'LOBBY') {
      throw new ConflictException('Комната уже начала игру');
    }
    if (session.participants.length < 2) {
      throw new ConflictException('Нужен хотя бы ещё один игрок');
    }
    const notReady = session.participants.filter(
      (p) => p.userId !== leaderId && !p.isReady,
    );
    if (notReady.length > 0) {
      throw new ConflictException('Не все игроки готовы');
    }

    const questions = await this.questionsService.pickRandom({
      count: session.questionCount,
    });

    // Shuffled independently per participant, so nobody's option order
    // matches anyone else's — the same anti-callout guarantee as duels.
    const answerRows = questions.flatMap((question, order) =>
      session.participants.map((participant) => {
        const shuffled = shuffleOptions(question);
        return {
          sessionId: session.id,
          participantId: participant.id,
          questionId: question.id,
          order,
          shuffledOptions: shuffled.options,
          shuffledCorrectIndex: shuffled.correctIndex,
        };
      }),
    );
    await this.prisma.gameAnswer.createMany({ data: answerRows });
    await this.questionsService.markUsed(questions.map((q) => q.id));

    await this.prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        status: 'IN_PROGRESS',
        questionCount: questions.length,
        currentOrder: 0,
        // Delayed by the pre-match "3-2-1-Поехали!" countdown the client
        // shows instead of question 1 — must match `ROOM_INTRO_TOTAL_MS` on
        // the client, and `RoomsGateway.onStart` pads its auto-timeout timer
        // by the same amount, or the real answering window would silently
        // shrink by the length of the countdown.
        currentQuestionStartedAt: new Date(Date.now() + ROOM_INTRO_TOTAL_MS),
      },
    });
    // Any friend who was invited but never joined missed their window —
    // there's no "invite to a running game" concept.
    await this.prisma.roomInvite.deleteMany({ where: { sessionId } });

    return this.buildState(await this.loadSession(sessionId), leaderId);
  }

  async submitAnswer(
    userId: string,
    sessionId: string,
    dto: RoomAnswerDto,
  ): Promise<RoomState> {
    const session = await this.loadSession(sessionId);
    const participant = this.requireParticipant(session, userId);
    if (session.status !== 'IN_PROGRESS') {
      throw new ConflictException('Игра ещё не началась или уже завершена');
    }

    const currentAnswer = participant.answers.find(
      (a) => a.order === session.currentOrder,
    );
    if (!currentAnswer) {
      throw new NotFoundException('Вопрос не найден');
    }
    if (currentAnswer.answeredAt) {
      throw new ConflictException('Вы уже ответили на этот вопрос');
    }
    if (currentAnswer.questionId !== dto.questionId) {
      throw new ConflictException('Это не текущий вопрос игры');
    }

    const startedAt = session.currentQuestionStartedAt ?? session.startedAt;
    const timeTakenMs = Math.max(0, Date.now() - startedAt.getTime());
    const isCorrect = dto.answerIndex === currentAnswer.shuffledCorrectIndex;

    const recorded = await this.recordAnswer(
      participant,
      currentAnswer,
      dto.answerIndex,
      isCorrect,
      timeTakenMs,
    );
    if (!recorded) {
      throw new ConflictException('Вы уже ответили на этот вопрос');
    }
    if (!isCorrect) {
      await this.questionsService.markMistake(currentAnswer.questionId);
    }

    return this.buildState(await this.loadSession(sessionId), userId);
  }

  /** True once every participant has answered the current question. Used by
   * the gateway to decide whether to cancel the time-limit timer early. */
  async isRoundResolved(sessionId: string): Promise<boolean> {
    const session = await this.loadSession(sessionId);
    return this.roundResolved(session, session.currentOrder);
  }

  /** Auto-submits a miss for anyone who hasn't answered the current question
   * yet — called by the gateway when the per-question timer fires. */
  async forceMissUnanswered(sessionId: string): Promise<void> {
    const session = await this.loadSession(sessionId);
    if (session.status !== 'IN_PROGRESS') return;

    const order = session.currentOrder;
    for (const participant of session.participants) {
      const answer = participant.answers.find((a) => a.order === order);
      if (answer && !answer.answeredAt) {
        await this.recordAnswer(
          participant,
          answer,
          null,
          false,
          session.timeLimitSeconds * 1000,
        );
      }
    }
  }

  /** Moves to the next question, or finishes the room if the round that just
   * resolved was the last one. Returns the resulting state plus whether the
   * room just finished, so the gateway knows whether to keep pacing timers. */
  async advance(
    sessionId: string,
  ): Promise<{ state: RoomState; finished: boolean }> {
    const session = await this.loadSession(sessionId);
    if (session.status !== 'IN_PROGRESS') {
      return {
        state: this.buildState(session, session.leaderId ?? ''),
        finished: true,
      };
    }

    if (session.currentOrder >= session.questionCount - 1) {
      await this.finishSession(sessionId);
      const finished = await this.loadSession(sessionId);
      return {
        state: this.buildState(finished, finished.leaderId ?? ''),
        finished: true,
      };
    }

    await this.prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        currentOrder: { increment: 1 },
        currentQuestionStartedAt: new Date(),
      },
    });
    const next = await this.loadSession(sessionId);
    return {
      state: this.buildState(next, next.leaderId ?? ''),
      finished: false,
    };
  }

  /**
   * Finds LOBBY rooms older than `thresholdMs` with zero currently connected
   * sockets, per the gateway's own live registry (`connectedSessionIds`).
   * This is the case the disconnect-grace timer can't catch: that timer only
   * ever starts once someone's socket has actually registered for a room
   * (`RoomsGateway.onEnter`) and then disconnects — if the leader created the
   * room over REST and their client never even opened the socket (closed the
   * tab immediately, a network hiccup right at creation, or a client bug),
   * nothing was ever scheduled to notice they're gone, and the room sat in
   * the public list forever with nobody able to close it.
   */
  async findStaleLobbySessionIds(
    thresholdMs: number,
    connectedSessionIds: string[],
  ): Promise<string[]> {
    const cutoff = new Date(Date.now() - thresholdMs);
    const rows = await this.prisma.gameSession.findMany({
      where: {
        mode: 'ROOM',
        status: 'LOBBY',
        startedAt: { lt: cutoff },
        id: { notIn: connectedSessionIds },
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** Closes a LOBBY room outright, with no leadership transfer — used only
   * by the stale-lobby sweep above, where by definition nobody is currently
   * connected for there to be anyone to hand it to. Returns `false` if the
   * room already moved on (started, or someone closed it) by the time this
   * runs, so the caller knows not to also broadcast a closure for it. */
  async abandonStaleLobby(sessionId: string): Promise<boolean> {
    const result = await this.prisma.gameSession.updateMany({
      where: { id: sessionId, mode: 'ROOM', status: 'LOBBY' },
      data: { status: 'ABANDONED', finishedAt: new Date() },
    });
    if (result.count > 0) {
      await this.prisma.roomInvite.deleteMany({ where: { sessionId } });
    }
    return result.count > 0;
  }

  // ---- internals ----

  private async loadSession(sessionId: string): Promise<LoadedRoom> {
    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: roomSessionInclude,
    });
    if (!session || session.mode !== 'ROOM') {
      throw new NotFoundException('Комната не найдена');
    }
    return session;
  }

  /**
   * Locks the session row (`SELECT ... FOR UPDATE`) for the duration of
   * `fn` — used wherever a capacity/membership check must be atomic with
   * the participant insert that follows it. Without this, two joins racing
   * for the same room's last open seat could both pass the "is there
   * room?" check and both insert, overfilling the room past
   * `maxParticipants`.
   */
  private async withSessionLock<T>(
    sessionId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "game_sessions" WHERE id = ${sessionId} FOR UPDATE`;
      return fn(tx);
    });
  }

  private requireParticipant(
    session: LoadedRoom,
    userId: string,
  ): LoadedRoomParticipant {
    const participant = session.participants.find((p) => p.userId === userId);
    if (!participant) {
      throw new NotFoundException('Вы не участник этой комнаты');
    }
    return participant;
  }

  private requireLeader(session: LoadedRoom, userId: string): void {
    if (session.leaderId !== userId) {
      throw new ForbiddenException('Только лидер комнаты может это сделать');
    }
  }

  private roundResolved(session: LoadedRoom, order: number): boolean {
    return session.participants.every((p) =>
      p.answers.some((a) => a.order === order && a.answeredAt !== null),
    );
  }

  /** Returns `false` (and writes nothing) if the answer was already
   * recorded by a concurrent call — a double-click or a retried request
   * after a flaky connection can fire the same submit twice, and without
   * this guard both would score, double-counting the point. */
  private async recordAnswer(
    participant: LoadedRoomParticipant,
    answer: LoadedRoomAnswer,
    selectedIndex: number | null,
    isCorrect: boolean,
    timeTakenMs: number,
  ): Promise<boolean> {
    const streak = isCorrect ? participant.streak + 1 : 0;
    const scoreDelta = isCorrect ? 1 : 0;

    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.gameAnswer.updateMany({
        where: { id: answer.id, answeredAt: null },
        data: {
          selectedIndex,
          isCorrect,
          answeredAt: new Date(),
          timeTakenMs,
          scoreDelta,
        },
      });
      if (claim.count === 0) {
        return false;
      }

      await tx.gameParticipant.update({
        where: { id: participant.id },
        data: {
          streak,
          correctCount: { increment: isCorrect ? 1 : 0 },
          score: { increment: scoreDelta },
        },
      });
      return true;
    });
  }

  private async finishSession(sessionId: string): Promise<void> {
    // Same race as the duel version of this method: a poll and an answer
    // submit can both decide the room is done at nearly the same moment.
    // The conditional `updateMany` makes the completion claim atomic, so
    // only one of two racing calls actually rewards participants.
    const claim = await this.prisma.gameSession.updateMany({
      where: { id: sessionId, status: 'IN_PROGRESS' },
      data: { status: 'COMPLETED', finishedAt: new Date() },
    });
    if (claim.count === 0) {
      return;
    }

    const session = await this.loadSession(sessionId);
    const ranked = this.rankParticipants(session.participants);
    const n = ranked.length;
    const competitive = n >= ROOM_MIN_PARTICIPANTS_FOR_RATING;

    for (let rank = 0; rank < ranked.length; rank++) {
      const participant = ranked[rank];
      const xpEarned = participant.correctCount * XP_PER_CORRECT_ANSWER;
      const coinsEarned = participant.correctCount * COINS_PER_CORRECT_ANSWER;

      let ratingDelta = 0;
      if (competitive) {
        if (participant.correctCount === 0) {
          ratingDelta = ROOM_ZERO_CORRECT_RATING_DELTA;
        } else {
          // rank 0 (best) -> percentile 1; rank n-1 (worst) -> percentile 0.
          const percentile = n > 1 ? (n - 1 - rank) / (n - 1) : 1;
          ratingDelta = Math.round(
            ROOM_LAST_PENALTY + percentile * (topReward(n) - ROOM_LAST_PENALTY),
          );
        }
      }

      const reward = await this.usersService.applyRoomRewards(
        participant.userId,
        {
          xpEarned,
          coinsEarned,
          ratingDelta,
        },
      );

      await this.prisma.gameParticipant.update({
        where: { id: participant.id },
        data: {
          xpEarned,
          coinsEarned,
          ratingDelta: reward.ratingDelta,
          ratingCapped: reward.ratingCapped,
        },
      });
    }
  }

  /** Best to worst: higher score first, then more correct answers, then
   * whoever joined the room earliest — a stable, deterministic order. */
  private rankParticipants(
    participants: LoadedRoomParticipant[],
  ): LoadedRoomParticipant[] {
    return [...participants].sort(
      (a, b) =>
        b.score - a.score ||
        b.correctCount - a.correctCount ||
        a.joinedAt.getTime() - b.joinedAt.getTime(),
    );
  }

  private toParticipantView(
    p: LoadedRoomParticipant,
    leaderId: string | null,
  ): RoomParticipantView {
    return {
      userId: p.userId,
      nickname: p.user.nickname,
      avatarUrl: p.user.avatarUrl,
      isLeader: p.userId === leaderId,
      isReady: p.isReady,
      correctCount: p.correctCount,
      score: p.score,
      streak: p.streak,
      xpEarned: p.xpEarned,
      coinsEarned: p.coinsEarned,
      ratingDelta: p.ratingDelta,
      ratingCapped: p.ratingCapped,
    };
  }

  private buildState(session: LoadedRoom, userId: string): RoomState {
    const me = session.participants.find((p) => p.userId === userId) ?? null;
    const participants = session.participants.map((p) =>
      this.toParticipantView(p, session.leaderId),
    );

    const base: RoomState = {
      sessionId: session.id,
      status: session.status as RoomStateStatus,
      roomName: session.roomName,
      visibility: session.visibility,
      inviteCode: session.inviteCode,
      password: session.leaderId === userId ? session.password : null,
      questionCount: session.questionCount,
      maxParticipants: session.maxParticipants ?? ROOM_MAX_PARTICIPANTS,
      timeLimitSeconds: session.timeLimitSeconds,
      you: me
        ? this.toParticipantView(me, session.leaderId)
        : {
            userId,
            nickname: null,
            avatarUrl: null,
            isLeader: false,
            isReady: false,
            correctCount: 0,
            score: 0,
            streak: 0,
            xpEarned: 0,
            coinsEarned: 0,
            ratingDelta: 0,
            ratingCapped: false,
          },
      leaderId: session.leaderId ?? '',
      participants,
      questionNumber: null,
      question: null,
      secondsRemaining: null,
      answeredUserIds: [],
      roundResolved: false,
      reveal: null,
      finalRanking: null,
    };

    if (session.status === 'LOBBY') {
      return base;
    }

    if (session.status === 'COMPLETED') {
      return {
        ...base,
        finalRanking: this.rankParticipants(session.participants).map((p) =>
          this.toParticipantView(p, session.leaderId),
        ),
      };
    }

    const order = session.currentOrder;
    const myAnswer = me?.answers.find((a) => a.order === order);
    if (!myAnswer) {
      return base;
    }

    const answeredUserIds = session.participants
      .filter((p) =>
        p.answers.some((a) => a.order === order && a.answeredAt !== null),
      )
      .map((p) => p.userId);
    const roundResolved = this.roundResolved(session, order);

    const startedAt = session.currentQuestionStartedAt ?? session.startedAt;
    const secondsRemaining = Math.max(
      0,
      session.timeLimitSeconds -
        Math.floor((Date.now() - startedAt.getTime()) / 1000),
    );

    return {
      ...base,
      questionNumber: order + 1,
      question: toPublicQuestion(myAnswer.question, myAnswer.shuffledOptions),
      secondsRemaining,
      answeredUserIds,
      roundResolved,
      reveal: roundResolved
        ? {
            correctIndex: myAnswer.shuffledCorrectIndex,
            explanation: myAnswer.question.explanation,
            book: myAnswer.question.book,
            chapter: myAnswer.question.chapter,
            verses: myAnswer.question.verses,
            answers: session.participants.map((p) => {
              const a = p.answers.find((x) => x.order === order);
              return {
                userId: p.userId,
                selectedIndex: a?.selectedIndex ?? null,
                isCorrect: a?.isCorrect ?? null,
                scoreDelta: a?.scoreDelta ?? 0,
              };
            }),
          }
        : null,
    };
  }
}
