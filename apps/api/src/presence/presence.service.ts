import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const ONLINE_PRESENCE_TTL_SECONDS = 60;

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
