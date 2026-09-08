import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { APP_ROLE_LABELS, type AppRole } from '@bible-arena/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AdminRegistry } from './admin-registry.service';

/** Как часто перечитывается, кто скрыл имя. */
const REFRESH_INTERVAL_MS = 30_000;

/**
 * Скрытое имя: одно место, где никнейм вырезается перед отправкой.
 *
 * ## Почему не «спрятать в вёрстке»
 *
 * Имя показывается в полутора десятках мест: списки игроков, друзья,
 * заявки, поиск, рейтинг, табло дуэли, лобби комнаты, баны, приглашения,
 * лента слова дня, уведомления бота. Спрятанное только на экранах, оно
 * осталось бы в ответах API — то есть на виду у любого, кто откроет
 * консоль браузера. Поэтому имя не покидает сервер вовсе.
 *
 * ## Почему карта по `userId`, а не поле в каждом запросе
 *
 * Напрашивалось добавить `hideName` и `telegramId` в `select` всех этих
 * запросов и решать на месте. Отброшено: пятнадцать одинаковых правок,
 * которые невозможно поддерживать — новый список пишется без них и
 * работает, а забытое место обнаруживается тем, что имя всё-таки видно.
 *
 * Здесь наоборот: скрывшихся единицы (право есть только у гейм-мастера и
 * администраторов), поэтому их `userId` держатся в памяти целиком, и
 * любому месту достаточно того `userId`, который у него и так есть.
 *
 * ## Почему карта обновляется по времени
 *
 * Флаг меняется редко и только своим владельцем, поэтому карта
 * перечитывается раз в полминуты и немедленно — при самом изменении
 * (`invalidate`). Второй копии сервера, если она появится, хватит
 * тридцати секунд, чтобы догнать; ради этого держать подписку через Redis
 * несоразмерно.
 */
@Injectable()
export class StaffNameMask implements OnModuleInit {
  private readonly logger = new Logger(StaffNameMask.name);
  /** userId → роль. Только те, кто скрыл имя. */
  private hidden = new Map<string, AppRole>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly admins: AdminRegistry,
  ) {}

  onModuleInit(): void {
    void this.refresh();
    // `unref`, иначе таймер держит процесс живым и тесты не завершаются.
    this.timer = setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS);
    this.timer.unref?.();
  }

  /**
   * Имя для показа рядом со значком роли.
   *
   * Скрытое отдаётся как `null`: значок роли идёт в тех же данных, и
   * клиент рисует его на месте имени (см. `displayName` в общих типах).
   */
  nickname(userId: string, nickname: string | null): string | null {
    return this.hidden.has(userId) ? null : nickname;
  }

  /**
   * Имя внутри фразы — «X вызывает вас на дуэль», сообщение бота, лента.
   *
   * Здесь `null` не годится: значок в текст не вставишь, а «Игрок»
   * вместо гейм-мастера — это не скрытие, а подмена личности. Возвращаем
   * метку роли: она и есть то, чем он представляется.
   */
  label(userId: string, nickname: string | null): string | null {
    const role = this.hidden.get(userId);
    return role ? APP_ROLE_LABELS[role] : nickname;
  }

  /** Скрыто ли имя этого человека. */
  isHidden(userId: string): boolean {
    return this.hidden.has(userId);
  }

  /** Позвать после смены флага, чтобы не ждать очередного обновления. */
  invalidate(): void {
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    try {
      const rows = await this.prisma.user.findMany({
        where: { hideName: true },
        select: { id: true, telegramId: true },
      });

      const next = new Map<string, AppRole>();
      for (const row of rows) {
        const role = this.admins.roleOf(row.telegramId.toString());
        // Роль могли отобрать, не сбросив флаг: тогда имя показывается
        // как у всех. Прятаться без права нельзя — иначе снятие роли не
        // возвращает человека в списки.
        if (role !== 'PLAYER') next.set(row.id, role);
      }
      this.hidden = next;
    } catch (error) {
      // Оставляем прежнюю карту: пустая означала бы, что скрытое имя
      // вдруг стало видно — а это ровно та ошибка, которой здесь быть
      // нельзя.
      this.logger.warn(
        `Не удалось обновить список скрытых имён: ${String(error)}`,
      );
    }
  }
}
