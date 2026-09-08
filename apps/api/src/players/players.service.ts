import { Injectable } from '@nestjs/common';
import {
  getTitleForRating,
  type FriendRelation,
  type PlayerView,
  type PlayersListResponse,
} from '@bible-arena/shared';
import type { Prisma, User } from '@prisma/client';
import { AdminRegistry } from '../auth/admin-registry.service';
import { StaffNameMask } from '../auth/staff-name-mask.service';
import { ContactPolicyService } from '../contact/contact-policy.service';
import { PresenceService } from '../presence/presence.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

/**
 * Сколько строк отдавать. Полсотни — это уже длинная прокрутка; кому нужен
 * конкретный человек, тот пользуется поиском, а не листает.
 */
const PAGE_SIZE = 50;

/** Меньше двух символов поиск не начинает: по одной букве ответ — это
 * половина приложения, и он ничего не сообщает. */
const MIN_QUERY_LENGTH = 2;

/**
 * Вкладка «Игроки» — все, кого можно позвать в игру, а не только друзья.
 *
 * Заменила собой вкладку «Друзья». Причина не косметическая: дружба была
 * пропуском (вызвать можно было только друга), и чтобы сыграть с
 * незнакомцем, надо было отправить заявку и дождаться ответа. Это два
 * лишних шага и ожидание ради защиты, которую держат другие вещи — отказ
 * от вызова, чёрный список, ограничение по жалобам. Дружба осталась, но
 * только как список своих: она поднимает человека наверх, а не открывает
 * дверь.
 *
 * Порядок в списке — сначала кто в сети. Это единственная сортировка,
 * которая отвечает на вопрос, с которым сюда заходят: «с кем сыграть
 * прямо сейчас».
 */
@Injectable()
export class PlayersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly contactPolicy: ContactPolicyService,
    private readonly usersService: UsersService,
    private readonly admins: AdminRegistry,
    private readonly staffNames: StaffNameMask,
  ) {}

  async list(
    currentUserId: string,
    rawQuery: string,
  ): Promise<PlayersListResponse> {
    const query = rawQuery.trim();
    const searching = query.length >= MIN_QUERY_LENGTH;
    if (query.length > 0 && !searching) {
      return { players: [], truncated: false };
    }

    const where = searching
      ? await this.searchWhere(currentUserId, query)
      : await this.browseWhere(currentUserId);

    // Порядок «сначала в сети» нельзя получить одним запросом: присутствие
    // живёт в Redis, а не в базе. Поэтому два запроса — по списку в сети и
    // по остальным, — а не сортировка после выборки: отсортировать можно
    // только то, что уже выбрано, и страница «первые 50 по рейтингу»
    // показала бы онлайн-игрока, только если он попал в эти 50.
    const onlineIds = await this.presence.onlineUserIds();
    const onlineRows =
      onlineIds.length === 0
        ? []
        : await this.prisma.user.findMany({
            where: { AND: [where, { id: { in: onlineIds } }] },
            orderBy: { rating: 'desc' },
            take: PAGE_SIZE,
          });

    const offlineRows = await this.prisma.user.findMany({
      where:
        onlineIds.length === 0
          ? where
          : { AND: [where, { id: { notIn: onlineIds } }] },
      orderBy: { rating: 'desc' },
      // Плюс один — чтобы узнать, что показано не всё, не считая всех.
      take: PAGE_SIZE - onlineRows.length + 1,
    });

    const truncated = offlineRows.length > PAGE_SIZE - onlineRows.length;
    const rows = [
      ...onlineRows,
      ...offlineRows.slice(0, PAGE_SIZE - onlineRows.length),
    ];

    return {
      players: await this.decorate(currentUserId, rows, new Set(onlineIds)),
      truncated,
    };
  }

  /**
   * Кого показывать без поиска.
   *
   * Детские аккаунты в общий список не попадают — та же защита, что и в
   * рейтинге: увидеть ник ребёнка не должно быть можно, просто открыв
   * вкладку. Найти его по **точному** нику по-прежнему можно (см.
   * `searchWhere`) — это работает для тех, кто ник уже знает, и не
   * работает как способ разглядывать незнакомых детей.
   *
   * Сам ребёнок при этом видит не всех, а только своих: браузить
   * незнакомцев ему нельзя ровно так же, как нельзя заходить в чужие
   * публичные комнаты.
   */
  private async browseWhere(
    currentUserId: string,
  ): Promise<Prisma.UserWhereInput> {
    const base: Prisma.UserWhereInput = {
      id: { not: currentUserId },
      // Без ника человек ещё не завершил вход: показывать его как игрока
      // не в чем, и позвать его нельзя.
      nickname: { not: null },
    };

    if (await this.usersService.isChildAccount(currentUserId)) {
      const friendIds = await this.prisma.friendship
        .findMany({
          where: { userId: currentUserId },
          select: { friendId: true },
        })
        .then((rows) => rows.map((r) => r.friendId));
      return { AND: [base, { id: { in: friendIds } }] };
    }

    return {
      AND: [
        base,
        // `ageBand: { not: 'CHILD' }` в одиночку было бы неверно: для
        // аккаунтов, ещё не ответивших про возраст, это NULL, а не «истина»,
        // и они молча выпали бы из списка целиком.
        { OR: [{ ageBand: null }, { ageBand: { not: 'CHILD' } }] },
      ],
    };
  }

  /** Поиск по нику: частичное совпадение — для взрослых, точное — для
   * всех. Правило перенесено из прежнего поиска друзей без изменений. */
  private async searchWhere(
    currentUserId: string,
    query: string,
  ): Promise<Prisma.UserWhereInput> {
    if (await this.usersService.isChildAccount(currentUserId)) {
      // Ребёнок ищет тем же способом, но только среди своих: поиск не
      // должен быть обходом того, что он не видит списком.
      const browse = await this.browseWhere(currentUserId);
      return {
        AND: [browse, { nickname: { contains: query, mode: 'insensitive' } }],
      };
    }

    return {
      id: { not: currentUserId },
      OR: [
        {
          AND: [
            { OR: [{ ageBand: null }, { ageBand: { not: 'CHILD' } }] },
            { nickname: { not: null, contains: query, mode: 'insensitive' } },
          ],
        },
        { nickname: { equals: query, mode: 'insensitive' } },
      ],
    };
  }

  /** Достраивает строки тем, чего нет в таблице пользователей: отношение,
   * присутствие и право позвать. Всё батчами — по запросу на вопрос, а не
   * по запросу на строку. */
  private async decorate(
    currentUserId: string,
    rows: User[],
    onlineIds: Set<string>,
  ): Promise<PlayerView[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);

    const [friendIds, requests, reachable] = await Promise.all([
      this.prisma.friendship
        .findMany({
          where: { userId: currentUserId, friendId: { in: ids } },
          select: { friendId: true },
        })
        .then((r) => new Set(r.map((row) => row.friendId))),
      this.prisma.friendRequest.findMany({
        where: {
          status: 'PENDING',
          OR: [
            { fromUserId: currentUserId, toUserId: { in: ids } },
            { toUserId: currentUserId, fromUserId: { in: ids } },
          ],
        },
        select: { fromUserId: true, toUserId: true },
      }),
      this.contactPolicy.reachableAmong(
        currentUserId,
        rows.map((row) => ({ id: row.id, ageBand: row.ageBand })),
      ),
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

    return rows.map((row) => ({
      userId: row.id,
      // Скрытое имя не уходит с сервера — на его месте клиент рисует
      // значок роли, которая едет в этой же строке.
      nickname: this.staffNames.nickname(row.id, row.nickname),
      avatarUrl: row.avatarUrl,
      level: row.level,
      rating: row.rating,
      title: getTitleForRating(row.rating),
      online: onlineIds.has(row.id),
      role: this.admins.roleOf(row.telegramId.toString()),
      relation: relationFor(row.id, { friendIds, outgoingTo, incomingFrom }),
      canInvite: reachable.has(row.id),
    }));
  }
}

function relationFor(
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
