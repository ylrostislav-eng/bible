import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/**
 * Сколько «в сети» держится без подтверждения.
 *
 * Это окно неправды, а не запас прочности: закрытое приложение уже ничего
 * сказать не может, и всё это время оно числится в сети. Явный уход
 * (`markOffline`) закрывает обычные случаи мгновенно, но не все — Telegram
 * может убить веб-вью без единого события, и тогда остаётся только время.
 *
 * Тридцать пять секунд — двойной запас к такту сердцебиения (15 с): один
 * пропущенный пинг ещё не выгоняет, два подряд — уже да. _Была минута при
 * такте в 40 секунд: закрывший приложение оставался «в сети» так долго,
 * что это заметил владелец, и всё это время ему не отправлялись
 * уведомления о вызовах._
 */
const ONLINE_PRESENCE_TTL_SECONDS = 35;

/**
 * Сколько игроков в сети отдавать списком.
 *
 * Предел нужен не ради экономии, а потому что дальше этот список едет в
 * `id: { in: [...] }` — запрос, который растёт вместе с числом
 * одновременных игроков. Двести человек на экране никто не пролистает, а
 * запрос длиной в тысячу идентификаторов уже заметен.
 */
const ONLINE_LIST_LIMIT = 200;

/** Ключ сортированного множества «кто сейчас в сети». */
const ONLINE_SET_KEY = 'presence:online';

/**
 * Tracks who has the app open, in Redis. Written on login and on the
 * client's periodic heartbeat ping (`POST /presence/ping`).
 *
 * Хранится дважды, и это намеренно:
 *
 * - `presence:<userId>` с TTL — ответ на вопрос «этот в сети?». Истекает
 *   сам, отдельного события «вышел» нет и не нужно.
 * - сортированное множество `presence:online`, где очко — время последнего
 *   касания. Оно отвечает на другой вопрос — «кто вообще сейчас в сети?»,
 *   — на который по ключам с TTL можно ответить только перебором `SCAN`
 *   по всей базе. _Пробовал обойтись одними ключами: пока вкладка «Игроки»
 *   показывала только друзей, их идентификаторы были известны заранее и
 *   хватало `MGET`. Со списком всех игроков заранее не известно ничего._
 *
 * У множества нет TTL на элементы, поэтому мёртвые записи вычищаются при
 * чтении по тому же порогу, что и TTL ключей: две правды об одном и том же
 * должны сходиться, иначе список в сети и точечная проверка начнут
 * противоречить друг другу.
 */
@Injectable()
export class PresenceService {
  constructor(private readonly redisService: RedisService) {}

  async markOnline(userId: string): Promise<void> {
    try {
      const now = Date.now();
      await this.redisService.client
        .multi()
        .set(
          `presence:${userId}`,
          now.toString(),
          'EX',
          ONLINE_PRESENCE_TTL_SECONDS,
        )
        .zadd(ONLINE_SET_KEY, now, userId)
        .exec();
    } catch {
      // Presence tracking is best-effort and must never block the caller.
    }
  }

  /**
   * Явный уход: человек свернул приложение или закрыл его.
   *
   * Раньше уйти было нельзя — присутствие только истекало само. Ожидание
   * само по себе терпимо, но оно врёт в двух заметных местах: сменивший
   * аккаунт ещё числится в сети под прежним, а уведомление о вызове не
   * отправляется, потому что «он же в сети». _Живой случай владельца:
   * вышел с одного аккаунта, вошёл с другого — и видел себя прежнего в
   * сети._
   *
   * Истечение по времени при этом остаётся страховкой: если приложение
   * убили жёстко и сказать «ухожу» оно не успело, через
   * `ONLINE_PRESENCE_TTL_SECONDS` всё равно станет тихо.
   */
  async markOffline(userId: string): Promise<void> {
    try {
      await this.redisService.client
        .multi()
        .del(`presence:${userId}`)
        .zrem(ONLINE_SET_KEY, userId)
        .exec();
    } catch {
      // Как и остальное присутствие — по возможности, но без последствий.
    }
  }

  /** Batch lookup — one round trip for a whole list instead of one per
   * player. Returns `false` for anyone whose key isn't set (offline, or
   * Redis unreachable), never throws. */
  async areOnline(userIds: string[]): Promise<Record<string, boolean>> {
    if (userIds.length === 0) return {};
    try {
      const values = await this.redisService.client.mget(
        userIds.map((id) => `presence:${id}`),
      );
      return Object.fromEntries(
        userIds.map((id, index) => [id, values[index] !== null]),
      );
    } catch {
      return Object.fromEntries(userIds.map((id) => [id, false]));
    }
  }

  /**
   * Кто сейчас в сети — недавние первыми.
   *
   * Пустой список при недоступном Redis, а не исключение: список игроков
   * должен открыться и без присутствия, просто без разделения на «в сети»
   * и «не в сети». Потерять сортировку лучше, чем потерять экран.
   */
  async onlineUserIds(limit = ONLINE_LIST_LIMIT): Promise<string[]> {
    try {
      const cutoff = Date.now() - ONLINE_PRESENCE_TTL_SECONDS * 1000;
      await this.redisService.client.zremrangebyscore(
        ONLINE_SET_KEY,
        0,
        cutoff,
      );
      return await this.redisService.client.zrevrange(
        ONLINE_SET_KEY,
        0,
        limit - 1,
      );
    } catch {
      return [];
    }
  }
}
