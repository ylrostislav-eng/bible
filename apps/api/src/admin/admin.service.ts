import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ADMIN_BALANCE_MAX_DELTA,
  ADMIN_BALANCE_MIN_DELTA,
  ADMIN_BROADCAST_MAX_LENGTH,
  ADMIN_MUTE_MAX_HOURS,
  GAME_MASTER_ONLY_MESSAGE,
  getTitleForRating,
  type AppRole,
  type AdminActionView,
  type AdminBroadcastAudience,
  type AdminBroadcastPreview,
  type AdminBroadcastResult,
  type AdminGameMode,
  type AdminOverview,
  type AdminPlayerCard,
  type AdminPlayerRow,
  type AdminPlayersResponse,
  type AdminSessionRow,
} from '@bible-arena/shared';
import type { AdminActionKind, Prisma, User } from '@prisma/client';
import { AdminRegistry } from '../auth/admin-registry.service';
import { TelegramBotService } from '../notifications/telegram-bot.service';
import { PresenceService } from '../presence/presence.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

/** Сколько строк отдавать в списке игроков: больше полусотни всё равно не
 * просматривают глазами, для точного поиска есть строка поиска. */
const PLAYERS_PAGE_SIZE = 50;

/**
 * Пауза между сообщениями рассылки.
 *
 * Telegram разрешает боту около 30 сообщений в секунду на всех, и при
 * превышении отвечает 429 с требованием подождать. Тридцать четыре
 * миллисекунды — это ровно под этой границей. Медленно и точно лучше, чем
 * быстро и с половиной недоставленных: рассылку нельзя повторить «только
 * тем, кому не дошло», не рассказав остальным то же самое дважды.
 */
const BROADCAST_DELAY_MS = 34;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly telegram: TelegramBotService,
    private readonly usersService: UsersService,
    private readonly admins: AdminRegistry,
  ) {}

  /** Кто действует — ник и роль берутся с сервера, а не из запроса: в
   * журнале должно стоять то, что было на самом деле. */
  async identify(userId: string): Promise<AdminIdentity> {
    const user = await this.requireTarget(userId);
    return {
      userId: user.id,
      nickname: user.nickname,
      role: this.admins.roleOf(user.telegramId.toString()),
    };
  }

  // ---- сводка ----

  async overview(): Promise<AdminOverview> {
    const since = new Date(Date.now() - DAY_MS);
    const weekAgo = new Date(Date.now() - WEEK_MS);
    const now = new Date();

    const [
      total,
      onlineIds,
      newLastWeek,
      children,
      byMode,
      chapterChecks,
      aliasMatches,
      hotColdDuels,
      activeSessions,
      activeHotCold,
      pendingReports,
      mutedNow,
      unresolvedErrors,
      errorsLastDay,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.presence.onlineUserIds(),
      this.prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.user.count({ where: { ageBand: 'CHILD' } }),
      this.prisma.gameSession.groupBy({
        by: ['mode'],
        where: { status: 'COMPLETED', finishedAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.chapterCheckSession.count({
        where: { completedAt: { gte: since } },
      }),
      this.prisma.aliasMatch.count({ where: { playedAt: { gte: since } } }),
      this.prisma.hotColdDuel.count({
        where: { finishedAt: { gte: since } },
      }),
      this.prisma.gameSession.count({
        where: {
          status: { in: ['WAITING_FOR_OPPONENT', 'LOBBY', 'IN_PROGRESS'] },
        },
      }),
      this.prisma.hotColdDuel.count({
        where: { status: { in: ['WAITING', 'IN_PROGRESS'] } },
      }),
      this.prisma.abuseReport.count({ where: { status: 'PENDING' } }),
      this.prisma.user.count({ where: { mutedUntil: { gt: now } } }),
      this.prisma.errorReport.count({ where: { resolved: false } }),
      this.prisma.errorReport.count({ where: { createdAt: { gte: since } } }),
    ]);

    const modeCount = (mode: 'SOLO' | 'DUEL' | 'ROOM') =>
      byMode.find((row) => row.mode === mode)?._count._all ?? 0;

    const lastDay: Record<AdminGameMode, number> = {
      SOLO: modeCount('SOLO'),
      DUEL: modeCount('DUEL'),
      ROOM: modeCount('ROOM'),
      ALIAS: aliasMatches,
      HOT_COLD: hotColdDuels,
      CHAPTER_CHECK: chapterChecks,
    };

    return {
      players: {
        total,
        online: onlineIds.length,
        newLastWeek,
        children,
      },
      games: { lastDay, active: activeSessions + activeHotCold },
      moderation: { pendingReports, mutedNow },
      errors: { unresolved: unresolvedErrors, lastDay: errorsLastDay },
      generatedAt: new Date().toISOString(),
    };
  }

  // ---- игроки ----

  async listPlayers(rawQuery: string): Promise<AdminPlayersResponse> {
    const query = rawQuery.trim();

    // Поиск администратора — не тот, что у игроков: здесь видно всех,
    // включая детские аккаунты и тех, кто ещё не выбрал ник. Это ровно то
    // место, где скрывать нечего: разбирать жалобу на аккаунт, которого
    // не видно в списке, невозможно.
    const where: Prisma.UserWhereInput = query
      ? {
          OR: [
            { nickname: { contains: query, mode: 'insensitive' } },
            { telegramUsername: { contains: query, mode: 'insensitive' } },
            { id: query },
            ...(/^-?\d+$/.test(query) ? [{ telegramId: BigInt(query) }] : []),
          ],
        }
      : {};

    const rows = await this.prisma.user.findMany({
      where,
      orderBy: { lastActiveAt: 'desc' },
      take: PLAYERS_PAGE_SIZE + 1,
    });

    const online = new Set(await this.presence.onlineUserIds());
    const shown = rows.slice(0, PLAYERS_PAGE_SIZE);

    return {
      players: shown.map((user) => this.toRow(user, online.has(user.id))),
      truncated: rows.length > PLAYERS_PAGE_SIZE,
    };
  }

  async playerCard(userId: string): Promise<AdminPlayerCard> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Игрок не найден');

    const [online, reportsAgainst, reportsPending] = await Promise.all([
      this.presence.areOnline([userId]),
      this.prisma.abuseReport.count({ where: { targetUserId: userId } }),
      this.prisma.abuseReport.count({
        where: { targetUserId: userId, status: 'PENDING' },
      }),
    ]);

    return {
      ...this.toRow(user, online[userId] === true),
      telegramUsername: user.telegramUsername,
      avatarUrl: user.avatarUrl,
      country: user.country,
      ageBand: user.ageBand,
      childMode: user.ageBand === 'CHILD',
      guardianPinSet: user.guardianPinHash !== null,
      experience: user.experience,
      coins: user.coins,
      title: getTitleForRating(user.rating),
      gamesPlayed: user.gamesPlayed,
      duelsPlayed: user.duelsPlayed,
      gamesWon: user.gamesWon,
      gamesLost: user.gamesLost,
      gamesDrawn: user.gamesDrawn,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      lastActiveAt: user.lastActiveAt.toISOString(),
      remindersEnabled: user.remindersEnabled,
      inviteNotificationsEnabled: user.inviteNotificationsEnabled,
      reportsAgainst,
      reportsPending,
    };
  }

  async mute(
    admin: AdminIdentity,
    userId: string,
    hours: number,
    reason?: string,
  ): Promise<{ mutedUntil: string }> {
    if (!Number.isFinite(hours) || hours <= 0 || hours > ADMIN_MUTE_MAX_HOURS) {
      throw new BadRequestException('Некорректный срок ограничения');
    }
    const target = await this.requireTouchableTarget(admin, userId);

    const mutedUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
    await this.prisma.user.update({
      where: { id: userId },
      data: { mutedUntil },
    });
    await this.record(admin, 'MUTE', target, {
      summary: `Ограничение на ${hours} ч${reason ? `: ${reason.trim()}` : ''}`,
    });

    return { mutedUntil: mutedUntil.toISOString() };
  }

  async unmute(admin: AdminIdentity, userId: string): Promise<void> {
    const target = await this.requireTarget(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { mutedUntil: null },
    });
    await this.record(admin, 'UNMUTE', target, {
      summary: 'Ограничение снято досрочно',
    });
  }

  async rename(
    admin: AdminIdentity,
    userId: string,
    nickname: string,
  ): Promise<AdminPlayerCard> {
    const target = await this.requireTouchableTarget(admin, userId);
    const was = target.nickname ?? '—';

    // Через общий путь смены профиля, а не прямым `update`: там живут
    // нормализация юникода, запрет зарезервированных ников и проверка
    // занятости. Своя вторая копия этих правил разошлась бы с первой, и
    // администратор смог бы выдать игроку ник, который сам игрок выбрать
    // не может.
    const updated = await this.usersService.updateProfile(userId, { nickname });

    await this.record(admin, 'RENAME', target, {
      summary: `Ник: ${was} → ${updated.nickname ?? '—'}`,
    });
    return this.playerCard(userId);
  }

  async adjustBalance(
    admin: AdminIdentity,
    userId: string,
    deltas: { coins?: number; rating?: number },
    note?: string,
  ): Promise<AdminPlayerCard> {
    this.assertGameMaster(admin);
    const coins = Math.trunc(deltas.coins ?? 0);
    const rating = Math.trunc(deltas.rating ?? 0);

    if (coins === 0 && rating === 0) {
      throw new BadRequestException('Нечего менять');
    }
    for (const value of [coins, rating]) {
      if (value < ADMIN_BALANCE_MIN_DELTA || value > ADMIN_BALANCE_MAX_DELTA) {
        throw new BadRequestException('Слишком большая правка');
      }
    }

    const target = await this.requireTarget(userId);

    // Монеты в минус не уводим: отрицательный кошелёк — состояние, которого
    // в игре не бывает, и весь остальной код о нём не знает.
    const nextCoins = Math.max(0, target.coins + coins);

    await this.prisma.user.update({
      where: { id: userId },
      data: { coins: nextCoins, rating: { increment: rating } },
    });

    const parts = [
      coins !== 0 ? `монеты ${coins > 0 ? '+' : ''}${coins}` : null,
      rating !== 0 ? `рейтинг ${rating > 0 ? '+' : ''}${rating}` : null,
    ].filter(Boolean);

    await this.record(admin, 'ADJUST_BALANCE', target, {
      summary: `${parts.join(', ')}${note?.trim() ? ` — ${note.trim()}` : ''}`,
    });

    return this.playerCard(userId);
  }

  /**
   * Удаление аккаунта — единственное необратимое действие здесь.
   *
   * Подтверждение ником, а не кнопкой «вы уверены?»: переписать ник —
   * задержка руки, а вторая кнопка нажимается тем же движением, что и
   * первая. Каскады в схеме уносят вместе с игроком его партии, ответы,
   * дружбы и жалобы; журнал администратора живёт без внешних ключей и
   * поэтому остаётся.
   */
  async deleteAccount(
    admin: AdminIdentity,
    userId: string,
    confirmNickname: string,
  ): Promise<void> {
    this.assertGameMaster(admin);
    const target = await this.requireTouchableTarget(admin, userId);

    if (admin.userId === userId) {
      throw new ForbiddenException('Свой аккаунт отсюда удалить нельзя');
    }
    const expected = (target.nickname ?? '').trim();
    if (!expected || confirmNickname.trim() !== expected) {
      throw new BadRequestException('Ник для подтверждения не совпал');
    }

    await this.prisma.user.delete({ where: { id: userId } });
    await this.record(admin, 'DELETE_ACCOUNT', target, {
      summary: `Аккаунт удалён (${expected})`,
    });
    this.logger.warn(`Администратор удалил аккаунт ${expected}`);
  }

  // ---- партии ----

  async activeSessions(): Promise<AdminSessionRow[]> {
    const [sessions, hotCold] = await Promise.all([
      this.prisma.gameSession.findMany({
        where: {
          status: { in: ['WAITING_FOR_OPPONENT', 'LOBBY', 'IN_PROGRESS'] },
        },
        include: { participants: { include: { user: true } } },
        orderBy: { startedAt: 'desc' },
        take: 100,
      }),
      this.prisma.hotColdDuel.findMany({
        where: { status: { in: ['WAITING', 'IN_PROGRESS'] } },
        include: { players: { include: { user: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    const rows: AdminSessionRow[] = [
      ...sessions.map((session): AdminSessionRow => ({
        sessionId: session.id,
        mode: session.mode,
        status: session.status,
        roomName: session.roomName,
        players: session.participants.map((p) => p.user.nickname ?? '—'),
        createdAt: session.startedAt.toISOString(),
        startedAt: session.startedAt.toISOString(),
      })),
      ...hotCold.map((duel): AdminSessionRow => ({
        sessionId: duel.id,
        mode: 'HOT_COLD',
        status: duel.status,
        roomName: null,
        players: duel.players.map((p) => p.user.nickname ?? '—'),
        createdAt: duel.createdAt.toISOString(),
        startedAt: duel.startedAt?.toISOString() ?? null,
      })),
    ];

    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Закрывает зависшую партию.
   *
   * Именно «закрывает», а не «удаляет»: партия — это ещё и история для её
   * участников, и стереть её значит стереть чужой вечер. `ABANDONED` —
   * тот же исход, который ставит автоматическая уборка брошенных партий,
   * поэтому весь остальной код с ним уже умеет обращаться.
   */
  async closeSession(admin: AdminIdentity, sessionId: string): Promise<void> {
    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
    });

    if (session) {
      if (session.status === 'COMPLETED' || session.status === 'ABANDONED') {
        throw new BadRequestException('Эта партия уже закрыта');
      }
      await this.prisma.gameSession.update({
        where: { id: sessionId },
        data: { status: 'ABANDONED', finishedAt: new Date() },
      });
      await this.record(admin, 'CLOSE_SESSION', null, {
        summary: `Закрыта партия ${session.mode} (${session.roomName ?? sessionId})`,
      });
      return;
    }

    const duel = await this.prisma.hotColdDuel.findUnique({
      where: { id: sessionId },
    });
    if (!duel) throw new NotFoundException('Партия не найдена');
    if (duel.status === 'FINISHED') {
      throw new BadRequestException('Эта партия уже закрыта');
    }

    await this.prisma.hotColdDuel.update({
      where: { id: sessionId },
      data: { status: 'FINISHED', finishedAt: new Date() },
    });
    await this.record(admin, 'CLOSE_SESSION', null, {
      summary: `Закрыта дуэль «горячо-холодно» (${sessionId})`,
    });
  }

  // ---- рассылка ----

  async broadcastPreview(
    audience: AdminBroadcastAudience,
  ): Promise<AdminBroadcastPreview> {
    const recipients = await this.prisma.user.count({
      where: this.audienceWhere(audience),
    });
    return { audience, recipients };
  }

  /**
   * Рассылка в Telegram.
   *
   * Отправляется тем, у кого не выключены уведомления о приглашениях: этот
   * же переключатель гасится автоматически, когда Telegram сообщает о
   * блокировке бота, поэтому он заодно отсекает тех, кому писать
   * бессмысленно. Отдельного «согласия на рассылку» не заводим: третий
   * переключатель рядом с двумя существующими человек не прочитает, а
   * промолчать в ответ на «выключите уведомления» нельзя.
   *
   * Идёт по одному сообщению с паузой — см. `BROADCAST_DELAY_MS`. Ждать
   * результата приходится администратору, и это тоже намеренно: увидеть
   * «отправлено 412, не дошло 3» полезнее, чем получить «принято в
   * работу» и гадать.
   */
  async broadcast(
    admin: AdminIdentity,
    audience: AdminBroadcastAudience,
    text: string,
  ): Promise<AdminBroadcastResult> {
    this.assertGameMaster(admin);

    const message = text.trim();
    if (!message) throw new BadRequestException('Пустое сообщение');
    if (message.length > ADMIN_BROADCAST_MAX_LENGTH) {
      throw new BadRequestException('Сообщение слишком длинное');
    }

    const recipients = await this.prisma.user.findMany({
      where: this.audienceWhere(audience),
      select: { id: true, telegramId: true },
    });

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      const result = await this.telegram.sendMessage(
        recipient.telegramId,
        message,
      );
      if (result.status === 'sent') {
        sent += 1;
      } else if (result.status === 'blocked') {
        // Тот же ответ, что и у напоминаний: человек ушёл, и писать ему
        // больше не надо ни сейчас, ни потом.
        failed += 1;
        await this.prisma.user.update({
          where: { id: recipient.id },
          data: { inviteNotificationsEnabled: false, remindersEnabled: false },
        });
      } else if (result.status === 'disabled') {
        // Бот не настроен — продолжать бессмысленно, каждая следующая
        // попытка вернёт то же самое.
        break;
      } else {
        failed += 1;
      }
      await new Promise((resolve) => setTimeout(resolve, BROADCAST_DELAY_MS));
    }

    await this.record(admin, 'BROADCAST', null, {
      summary: `Рассылка (${audience}): доставлено ${sent}, не дошло ${failed}`,
    });

    return { sent, failed };
  }

  /**
   * Запись в журнал о правке содержимого.
   *
   * Отдельным методом, а не через приватный `record`, потому что цель тут
   * не игрок, а вопрос или слово: в журнале у такой строки нет «над кем»,
   * зато в описании есть что именно поменяли.
   */
  async logContent(
    actor: AdminIdentity,
    kind: 'EDIT_CONTENT' | 'CREATE_CONTENT' | 'DELETE_CONTENT',
    summary: string,
  ): Promise<void> {
    await this.record(actor, kind, null, { summary });
  }

  // ---- журнал ----

  /**
   * Журнал гейм-мастера.
   *
   * Гейм-мастер видит всё — в этом и смысл: журнал заведён затем, чтобы
   * действия команды над игроками не растворялись. Администратор видит
   * свои строки: чужие записи ему не нужны для работы, а «кто ещё что
   * сделал» — вопрос владельца, а не коллеги.
   */
  async actions(actor: AdminIdentity, limit = 100): Promise<AdminActionView[]> {
    const rows = await this.prisma.adminAction.findMany({
      where:
        actor.role === 'GAME_MASTER'
          ? undefined
          : { adminUserId: actor.userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      actorRole: row.actorRole,
      adminNickname: row.adminNickname,
      targetNickname: row.targetNickname,
      targetUserId: row.targetUserId,
      summary: row.summary,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  // ---- внутреннее ----

  private audienceWhere(
    audience: AdminBroadcastAudience,
  ): Prisma.UserWhereInput {
    const base: Prisma.UserWhereInput = { inviteNotificationsEnabled: true };
    if (audience === 'ACTIVE_MONTH') {
      return {
        AND: [base, { lastActiveAt: { gte: new Date(Date.now() - MONTH_MS) } }],
      };
    }
    return base;
  }

  private toRow(user: User, online: boolean): AdminPlayerRow {
    return {
      userId: user.id,
      nickname: user.nickname,
      telegramId: user.telegramId.toString(),
      level: user.level,
      rating: user.rating,
      online,
      role: this.admins.roleOf(user.telegramId.toString()),
      mutedUntil:
        user.mutedUntil && user.mutedUntil.getTime() > Date.now()
          ? user.mutedUntil.toISOString()
          : null,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private async requireTarget(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Игрок не найден');
    return user;
  }

  /**
   * Цель, которую можно трогать: не тот, кто выше или вровень.
   *
   * Администратор не трогает администратора и гейм-мастера, гейм-мастер
   * не трогает себя. Это не про недоверие внутри команды, а про цену
   * ошибки: промах в списке, где строки похожи, стоил бы доступа к
   * собственному приложению, а вернуть права можно только через панель
   * развёртывания и перезапуск сервиса.
   */
  private async requireTouchableTarget(
    actor: AdminIdentity,
    userId: string,
  ): Promise<User> {
    const user = await this.requireTarget(userId);
    if (user.id === actor.userId) return user;

    const targetRole = this.admins.roleOf(user.telegramId.toString());
    if (targetRole === 'GAME_MASTER') {
      throw new ForbiddenException('Гейм-мастера трогать нельзя');
    }
    if (targetRole === 'ADMIN' && actor.role !== 'GAME_MASTER') {
      throw new ForbiddenException('Другого администратора трогать нельзя');
    }
    return user;
  }

  /** Исключительное право гейм-мастера. Охранник на маршруте — первый
   * рубеж; этот — второй, на случай нового вызова мимо контроллера. */
  private assertGameMaster(actor: AdminIdentity): void {
    if (actor.role !== 'GAME_MASTER') {
      throw new ForbiddenException(GAME_MASTER_ONLY_MESSAGE);
    }
  }

  private async record(
    admin: AdminIdentity,
    kind: AdminActionKind,
    target: User | null,
    data: { summary: string },
  ): Promise<void> {
    await this.prisma.adminAction.create({
      data: {
        adminUserId: admin.userId,
        adminNickname: admin.nickname,
        actorRole: admin.role === 'GAME_MASTER' ? 'GAME_MASTER' : 'ADMIN',
        kind,
        targetUserId: target?.id ?? null,
        targetNickname: target?.nickname ?? null,
        summary: data.summary,
      },
    });
  }
}

/** Кто делает действие — для журнала и для правил «кого нельзя трогать»
 * и «что может только гейм-мастер». */
export interface AdminIdentity {
  userId: string;
  nickname: string | null;
  role: AppRole;
}
