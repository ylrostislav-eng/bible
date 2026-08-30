import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const ONLINE_PRESENCE_TTL_SECONDS = 60;

/** Tracks who has the app open, in Redis (`presence:<userId>`, a rolling
 * TTL — no explicit "went offline" event, presence just expires). Written on
 * login and on the client's periodic heartbeat ping (`POST /presence/ping`);
 * read by the friends list to show who's online right now. */
@Injectable()
export class PresenceService {
  constructor(private readonly redisService: RedisService) {}

  async markOnline(userId: string): Promise<void> {
    try {
      await this.redisService.client.set(
        `presence:${userId}`,
        Date.now().toString(),
        'EX',
        ONLINE_PRESENCE_TTL_SECONDS,
      );
    } catch {
      // Presence tracking is best-effort and must never block the caller.
    }
  }

  /** Batch lookup — one round trip for a whole friends list instead of one
   * per friend. Returns `false` for anyone whose key isn't set (offline, or
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
}
