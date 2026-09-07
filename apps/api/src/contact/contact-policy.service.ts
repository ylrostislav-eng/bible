import { ForbiddenException, Injectable } from '@nestjs/common';
import { CANNOT_REACH_MESSAGE } from '@bible-arena/shared';
import { ModerationService } from '../moderation/moderation.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Одно правило на все способы дотянуться до человека.
 *
 * Способов три — заявка в друзья, вызов на дуэль, приглашение в комнату, —
 * и до этого сервиса у каждого был свой набор проверок, разошедшийся между
 * собой: заявка смотрела чёрный список в обе стороны, вызов и приглашение
 * — только в одну; ограничение по жалобам стояло в трёх местах отдельными
 * строками. Такое расхождение и есть тот самый случай, когда правило
 * «видно в интерфейсе, но не проверено на сервере» рождается само:
 * достаточно добавить четвёртый способ позвать и забыть про одну из
 * проверок.
 *
 * Поэтому проверка одна и вызывается первой строкой каждого из трёх
 * действий.
 *
 * **Дружбы среди правил больше нет.** Раньше вызвать можно было только
 * друга, и это стоило двух лишних шагов с ожиданием ответа ради защиты,
 * которую на деле держат другие вещи: вызов отклоняется одним тапом,
 * назойливый попадает в чёрный список, злоупотребляющий — под ограничение
 * по жалобам. Дружба осталась списком «своих», а не пропуском.
 */
@Injectable()
export class ContactPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
  ) {}

  /**
   * Может ли `fromUserId` позвать `toUserId`. Бросает исключение, если нет.
   *
   * Порядок проверок важен: сначала своё ограничение (оно про самого
   * зовущего и не рассказывает ничего о другом человеке), потом чёрный
   * список, потом детское правило.
   */
  async assertCanReach(fromUserId: string, toUserId: string): Promise<void> {
    await this.moderation.assertNotMuted(fromUserId);

    const [ban, target] = await Promise.all([
      // В обе стороны: заблокировавший не хочет видеть приглашений от
      // заблокированного, а заблокированный — от того, кого он сам закрыл.
      this.prisma.roomBan.findFirst({
        where: {
          OR: [
            { leaderId: fromUserId, bannedUserId: toUserId },
            { leaderId: toUserId, bannedUserId: fromUserId },
          ],
        },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { id: toUserId },
        select: { ageBand: true },
      }),
    ]);

    if (ban) {
      // Одна формулировка в обе стороны намеренно: «вас заблокировали»
      // рассказало бы отправителю про чужое решение, которое его не
      // касается.
      throw new ForbiddenException('Пригласить этого игрока нельзя');
    }

    if (target?.ageBand === 'CHILD') {
      await this.assertChildAddedThem(toUserId, fromUserId);
    }
  }

  /**
   * Детское правило: ребёнка может позвать только тот, кого он добавил сам.
   *
   * Раньше опорой была взаимная дружба — то есть согласие ребёнка. Когда
   * вызывать стало можно кого угодно, эта опора исчезла бы вместе с
   * требованием дружбы, и любой взрослый смог бы звать ребёнка в игру.
   * Поэтому для детских аккаунтов требование сохранено, но в одну сторону:
   * важна не взаимность, а то, что **ребёнок** внёс этого человека в свой
   * список.
   */
  private async assertChildAddedThem(
    childId: string,
    otherId: string,
  ): Promise<void> {
    const added = await this.prisma.friendship.findUnique({
      where: { userId_friendId: { userId: childId, friendId: otherId } },
      select: { userId: true },
    });
    if (!added) throw new ForbiddenException(CANNOT_REACH_MESSAGE);
  }

  /**
   * Тот же вопрос для целого списка — кого из этих можно позвать.
   *
   * Отдельным методом, а не циклом по `assertCanReach`: на экране игроков
   * строк полсотни, и поштучная проверка стоила бы сотню запросов вместо
   * двух. Ограничение по жалобам здесь не спрашивается — оно про самого
   * зовущего и одинаково для всех строк, поэтому проверяется один раз
   * снаружи.
   *
   * Спрятанная кнопка при этом ничего не запрещает — запрет живёт в
   * `assertCanReach`, который сервер спросит при нажатии.
   */
  async reachableAmong(
    fromUserId: string,
    targets: { id: string; ageBand: string | null }[],
  ): Promise<Set<string>> {
    const ids = targets.map((t) => t.id);
    if (ids.length === 0) return new Set();

    const childIds = targets
      .filter((t) => t.ageBand === 'CHILD')
      .map((t) => t.id);

    const [bans, addedBy] = await Promise.all([
      this.prisma.roomBan.findMany({
        where: {
          OR: [
            { leaderId: fromUserId, bannedUserId: { in: ids } },
            { bannedUserId: fromUserId, leaderId: { in: ids } },
          ],
        },
        select: { leaderId: true, bannedUserId: true },
      }),
      childIds.length === 0
        ? Promise.resolve<{ userId: string }[]>([])
        : this.prisma.friendship.findMany({
            where: { userId: { in: childIds }, friendId: fromUserId },
            select: { userId: true },
          }),
    ]);

    const blocked = new Set<string>();
    for (const ban of bans) {
      blocked.add(
        ban.leaderId === fromUserId ? ban.bannedUserId : ban.leaderId,
      );
    }
    const childrenWhoAdded = new Set(addedBy.map((row) => row.userId));

    return new Set(
      ids.filter(
        (id) =>
          !blocked.has(id) &&
          (!childIds.includes(id) || childrenWhoAdded.has(id)),
      ),
    );
  }
}
