import { Injectable, Logger } from '@nestjs/common';
import {
  ACHIEVEMENTS,
  type AchievementMetric,
  type AchievementView,
  type AchievementsResponse,
} from '@bible-arena/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** How long a freshly unlocked achievement keeps being reported as new.
 * Long enough to survive a remount or a refresh on the way to the profile,
 * short enough that it isn't still congratulating anyone tomorrow. */
const RECENTLY_UNLOCKED_WINDOW_MS = 5 * 60 * 1000;

@Injectable()
export class AchievementsService {
  private readonly logger = new Logger(AchievementsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The measured numbers every achievement is scored against.
   *
   * All of them come from data the app already keeps, which is what makes
   * the whole feature retroactive: a player who has been here for months
   * gets their existing history counted the first time they open the
   * screen, instead of a wall of empty progress bars.
   *
   * Learning is counted in *distinct* chapters and books rather than in
   * completed check-ups: counting attempts would make replaying one
   * familiar chapter the fastest route, which is the opposite of the point.
   */
  private async collectMetrics(
    userId: string,
  ): Promise<Record<AchievementMetric, number>> {
    const [user, chapters, friends] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { gamesPlayed: true, gamesWon: true, longestStreak: true },
      }),
      this.prisma.chapterCheckSession.findMany({
        where: { userId, completedAt: { not: null } },
        select: { bookId: true, chapter: true },
        distinct: ['bookId', 'chapter'],
      }),
      this.prisma.friendship.count({ where: { userId } }),
    ]);

    return {
      longestStreak: user?.longestStreak ?? 0,
      gamesPlayed: user?.gamesPlayed ?? 0,
      duelWins: user?.gamesWon ?? 0,
      chaptersChecked: chapters.length,
      booksTouched: new Set(chapters.map((c) => c.bookId)).size,
      friends,
    };
  }

  /**
   * Everything the achievements screen needs, and — as a side effect —
   * unlocking whatever has just been earned.
   *
   * Unlocking lazily on read rather than on every reward path is deliberate:
   * a check spread across four reward paths is four places to forget, and
   * the achievement itself is only ever *seen* here. The cost is that the
   * coin reward lands when the player next opens the screen rather than the
   * instant they qualify — acceptable, since `newlyUnlocked` makes that
   * moment visible rather than silent.
   */
  async listForUser(userId: string): Promise<AchievementsResponse> {
    const [metrics, existing] = await Promise.all([
      this.collectMetrics(userId),
      this.prisma.userAchievement.findMany({ where: { userId } }),
    ]);
    const unlockedAt = new Map(
      existing.map((row) => [row.achievementId, row.unlockedAt]),
    );

    const toUnlock = ACHIEVEMENTS.filter(
      (def) => !unlockedAt.has(def.id) && metrics[def.metric] >= def.target,
    );

    // Which of `toUnlock` this particular call actually won the race to
    // insert — not the same thing, and the difference is money.
    const actuallyUnlocked: typeof toUnlock = [];

    if (toUnlock.length > 0) {
      const now = new Date();
      try {
        await this.prisma.$transaction(async (tx) => {
          // One insert per achievement, and the coins are summed from the
          // inserts that *landed*. Writing them all at once and then
          // incrementing by the full total looks equivalent and isn't:
          // `skipDuplicates` keeps the table free of duplicate rows while
          // every concurrent caller still pays out in full, so opening the
          // screen in four tabs paid four times over. Measured, not
          // theorised — four parallel requests granted 560 coins for 140
          // coins' worth of achievements.
          //
          // Concurrency is handled by the unique index: a second
          // transaction inserting the same row blocks until the first
          // commits and then reports `count: 0`, so exactly one caller
          // counts each achievement.
          for (const def of toUnlock) {
            const result = await tx.userAchievement.createMany({
              data: { userId, achievementId: def.id, unlockedAt: now },
              skipDuplicates: true,
            });
            if (result.count > 0) actuallyUnlocked.push(def);
          }

          const coins = actuallyUnlocked.reduce(
            (sum, def) => sum + def.coins,
            0,
          );
          if (coins > 0) {
            await tx.user.update({
              where: { id: userId },
              data: { coins: { increment: coins } },
            });
          }
        });
        for (const def of actuallyUnlocked) unlockedAt.set(def.id, now);
      } catch (error) {
        // A failure here must not cost the player their achievements
        // screen: report what they have, and the unlock is retried on the
        // next open.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError))
          throw error;
        this.logger.warn(`Achievement unlock failed: ${error.code}`);
        actuallyUnlocked.length = 0;
      }
    }

    const achievements = ACHIEVEMENTS.map((def): AchievementView => {
      const at = unlockedAt.get(def.id) ?? null;
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        icon: def.icon,
        category: def.category,
        target: def.target,
        coins: def.coins,
        progress: Math.min(metrics[def.metric], def.target),
        unlocked: at !== null,
        unlockedAt: at?.toISOString() ?? null,
      };
    });

    // "Recently unlocked" is a time window, not "unlocked by this exact
    // request". Reporting it only on the unlocking call meant any second
    // fetch answered empty and erased the celebration — which is what
    // happens on a remount, a refresh, or React's development
    // double-mount. The window closes on its own.
    const recentSince = Date.now() - RECENTLY_UNLOCKED_WINDOW_MS;
    return {
      achievements,
      unlockedCount: achievements.filter((a) => a.unlocked).length,
      totalCount: achievements.length,
      newlyUnlocked: achievements.filter(
        (a) => a.unlockedAt !== null && Date.parse(a.unlockedAt) >= recentSince,
      ),
    };
  }
}
