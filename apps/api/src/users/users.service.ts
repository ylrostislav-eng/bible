import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  LanguageCode,
  LeaderboardEntry,
  StreakGoalDays,
  UserProfile,
} from '@bible-arena/shared';
import {
  ROOM_DAILY_RATING_CAP,
  getTitleForRating,
  STREAK_GOAL_COIN_REWARD,
  XP_PER_LEVEL,
} from '@bible-arena/shared';
import { Prisma } from '@prisma/client';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateProfileDto } from './dto/update-profile.dto';

const LEADERBOARD_SIZE = 50;

const RATING_PER_CORRECT_ANSWER = 5;
const RATING_PENALTY_PER_WRONG_ANSWER = 3;
const XP_PER_CORRECT_ANSWER = 10;
const COINS_PER_CORRECT_ANSWER = 2;

/** How often the same chapter's check can earn points again. */
export const CHAPTER_CHECK_COOLDOWN_DAYS = 7;

/** Duel wins beyond this many per day still count as wins, but earn no rating. */
const DAILY_DUEL_RATING_WIN_CAP = 10;

/** Grace period before inactivity starts costing rating, and the daily rate after that. */
const INACTIVITY_GRACE_DAYS = 30;
const INACTIVITY_DECAY_PER_DAY = 1;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs `fn` with the user row locked for the duration of the transaction
   * (`SELECT ... FOR UPDATE`), passing in a freshly re-read `user` taken
   * *after* the lock is acquired. Every reward path below reads a user,
   * derives new absolute values from it (experience, rating, streak...) and
   * writes them back — without a lock, two rewards finishing around the same
   * moment (e.g. a duel and a solo game ending together) can both read the
   * same starting values and the second write silently clobbers the first's
   * result, losing or double-counting a reward. `coins` doesn't need this
   * (it's a Prisma `increment`, already atomic) — this is for every field
   * that isn't.
   */
  private async withUserLock<T>(
    userId: string,
    fn: (tx: Prisma.TransactionClient, user: User) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }
      return fn(tx, user);
    });
  }

  async findOrCreateByTelegramId(params: {
    telegramId: bigint;
    telegramUsername: string | null;
    telegramAvatarUrl: string | null;
  }): Promise<User> {
    const existing = await this.prisma.user.findUnique({
      where: { telegramId: params.telegramId },
    });

    if (existing) {
      if (params.telegramUsername !== existing.telegramUsername) {
        return this.prisma.user.update({
          where: { id: existing.id },
          data: { telegramUsername: params.telegramUsername },
        });
      }
      return existing;
    }

    return this.prisma.user.create({
      data: {
        telegramId: params.telegramId,
        avatarUrl: params.telegramAvatarUrl,
        telegramUsername: params.telegramUsername,
      },
    });
  }

  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<User> {
    if (dto.nickname) {
      const existing = await this.prisma.user.findUnique({
        where: { nickname: dto.nickname },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('Этот никнейм уже занят');
      }
    }

    try {
      return await this.prisma.user.update({
        where: { id },
        data: {
          nickname: dto.nickname,
          avatarUrl: dto.avatarUrl,
          country: dto.country,
          language: dto.language,
        },
      });
    } catch (error) {
      // The check above is only a fast-path convenience — it can't close a
      // race where two people claim the same free nickname at the same
      // moment, so the actual guarantee is the DB's unique constraint.
      // Without this, the second writer would get a raw Prisma
      // constraint-violation error instead of a clean one.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Этот никнейм уже занят');
      }
      throw error;
    }
  }

  /**
   * Call whenever the app is confirmed open (login, profile fetch). Applies
   * the inactivity rating decay once, lazily — there's no background job,
   * so a long absence is settled the moment the user comes back, not
   * day-by-day while they're gone. Skips the write entirely on repeat calls
   * within the same day so this doesn't hammer the DB on every request.
   */
  async touchActivity(userId: string): Promise<User> {
    // Called on every login/profile fetch, so the common case (already
    // touched today) must stay a cheap, lock-free read — only fall through
    // to the locked read-modify-write when a write actually looks needed.
    const user = await this.findById(userId);
    const now = new Date();
    const daysSinceActive = Math.floor(
      (now.getTime() - user.lastActiveAt.getTime()) / 86_400_000,
    );
    if (daysSinceActive < 1) {
      return user;
    }

    return this.withUserLock(userId, async (tx, locked) => {
      // Re-check under the lock — another concurrent call may have already
      // touched (and possibly decayed) this user between the read above and
      // the lock being acquired.
      const daysSinceActiveLocked = Math.floor(
        (now.getTime() - locked.lastActiveAt.getTime()) / 86_400_000,
      );
      if (daysSinceActiveLocked < 1) {
        return locked;
      }
      if (daysSinceActiveLocked <= INACTIVITY_GRACE_DAYS) {
        return tx.user.update({
          where: { id: userId },
          data: { lastActiveAt: now },
        });
      }

      const decayDays = daysSinceActiveLocked - INACTIVITY_GRACE_DAYS;
      return tx.user.update({
        where: { id: userId },
        data: {
          rating: locked.rating - decayDays * INACTIVITY_DECAY_PER_DAY,
          lastActiveAt: now,
        },
      });
    });
  }

  /**
   * Applies XP/coin/rating rewards from a finished game and recalculates
   * level. `outcome`/`ratingDelta` only apply to competitive modes (duels) —
   * solo games leave gamesWon/gamesLost/rating untouched. `cappedWin`
   * enforces the daily duel-win rating cap: past the cap, the win still
   * counts for gamesWon/streak-style stats, just not for rating, so title
   * can't be farmed by chain-dueling.
   */
  async applyGameRewards(
    userId: string,
    params: {
      xpEarned: number;
      coinsEarned: number;
      outcome?: 'win' | 'loss' | 'draw';
      ratingDelta?: number;
      cappedWin?: boolean;
    },
  ): Promise<{
    user: User;
    leveledUp: boolean;
    ratingDelta: number;
    ratingCapped: boolean;
  }> {
    return this.withUserLock(userId, async (tx, user) => {
      let ratingDelta = params.ratingDelta ?? 0;
      let ratingCapped = false;
      let duelRatingWinsToday = user.duelRatingWinsToday;
      let duelRatingCapDate = user.duelRatingCapDate;

      if (params.cappedWin) {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const capDate = user.duelRatingCapDate
          ? new Date(user.duelRatingCapDate)
          : null;
        if (capDate) capDate.setUTCHours(0, 0, 0, 0);
        const isNewDay = !capDate || capDate.getTime() !== today.getTime();

        duelRatingWinsToday = isNewDay ? 0 : user.duelRatingWinsToday;
        duelRatingCapDate = today;

        if (duelRatingWinsToday >= DAILY_DUEL_RATING_WIN_CAP) {
          ratingDelta = 0;
          ratingCapped = true;
        } else {
          duelRatingWinsToday += 1;
        }
      }

      const experience = user.experience + params.xpEarned;
      const level = Math.floor(experience / XP_PER_LEVEL) + 1;
      const leveledUp = level > user.level;
      const rating = user.rating + ratingDelta;

      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          experience,
          level,
          rating,
          coins: { increment: params.coinsEarned },
          gamesPlayed: { increment: 1 },
          // `outcome` is only ever passed for duels — solo games leave it
          // undefined, so this is how a duel is told apart from a solo game.
          ...(params.outcome !== undefined && {
            duelsPlayed: { increment: 1 },
          }),
          ...(params.outcome === 'win' && { gamesWon: { increment: 1 } }),
          ...(params.outcome === 'loss' && { gamesLost: { increment: 1 } }),
          ...(params.outcome === 'draw' && { gamesDrawn: { increment: 1 } }),
          ...(params.cappedWin && { duelRatingWinsToday, duelRatingCapDate }),
        },
      });

      return { user: updated, leveledUp, ratingDelta, ratingCapped };
    });
  }

  /**
   * Applies XP/coin/rating rewards from a finished room match (3+ players).
   * Unlike the 1v1 duel cap (a per-day win count that zeroes rating past the
   * limit), the room cap tracks raw points earned today and *clips* a single
   * reward down to whatever headroom remains — a player near the cap still
   * gets a partial payout instead of nothing. Penalties (a negative
   * `ratingDelta`) are never capped and don't count against the earn cap.
   */
  async applyRoomRewards(
    userId: string,
    params: { xpEarned: number; coinsEarned: number; ratingDelta: number },
  ): Promise<{
    user: User;
    leveledUp: boolean;
    ratingDelta: number;
    ratingCapped: boolean;
  }> {
    return this.withUserLock(userId, async (tx, user) => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const capDate = user.roomRatingCapDate
        ? new Date(user.roomRatingCapDate)
        : null;
      if (capDate) capDate.setUTCHours(0, 0, 0, 0);
      const isNewDay = !capDate || capDate.getTime() !== today.getTime();
      const pointsToday = isNewDay ? 0 : user.roomRatingPointsToday;

      let ratingDelta = params.ratingDelta;
      let ratingCapped = false;
      let newPointsToday = pointsToday;

      if (ratingDelta > 0) {
        const remaining = ROOM_DAILY_RATING_CAP - pointsToday;
        if (remaining <= 0) {
          ratingDelta = 0;
          ratingCapped = true;
        } else if (ratingDelta > remaining) {
          ratingDelta = remaining;
          ratingCapped = true;
          newPointsToday = ROOM_DAILY_RATING_CAP;
        } else {
          newPointsToday = pointsToday + ratingDelta;
        }
      }

      const experience = user.experience + params.xpEarned;
      const level = Math.floor(experience / XP_PER_LEVEL) + 1;
      const leveledUp = level > user.level;
      const rating = user.rating + ratingDelta;

      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          experience,
          level,
          rating,
          coins: { increment: params.coinsEarned },
          gamesPlayed: { increment: 1 },
          roomRatingPointsToday: newPointsToday,
          roomRatingCapDate: today,
        },
      });

      return { user: updated, leveledUp, ratingDelta, ratingCapped };
    });
  }

  /**
   * Rewards a completed chapter check-up: `+5` rating per correct answer,
   * `-3` per wrong/expired one — but only when `awardsPoints` is true (the
   * caller enforces the 7-day-per-chapter cooldown; past it, this is a free
   * practice replay). The streak advances regardless of `awardsPoints` —
   * it's about showing up, matching the "did today's exercise" model, not
   * about the score.
   */
  async applyChapterCheckRewards(
    userId: string,
    params: {
      correctCount: number;
      wrongCount: number;
      awardsPoints: boolean;
      /** `Date.prototype.getTimezoneOffset()` from the client, if it sent
       * one — see `computeStreakUpdate`. */
      timezoneOffsetMinutes?: number;
    },
  ): Promise<{
    user: User;
    leveledUp: boolean;
    ratingEarned: number;
    xpEarned: number;
    coinsEarned: number;
    streak: {
      current: number;
      longest: number;
      increased: boolean;
      goalDays: number | null;
      goalReachedNow: boolean;
      goalCoinsEarned: number;
    };
  }> {
    return this.withUserLock(userId, async (tx, user) => {
      const ratingEarned = params.awardsPoints
        ? params.correctCount * RATING_PER_CORRECT_ANSWER -
          params.wrongCount * RATING_PENALTY_PER_WRONG_ANSWER
        : 0;
      const xpEarned = params.awardsPoints
        ? params.correctCount * XP_PER_CORRECT_ANSWER
        : 0;
      const coinsEarned = params.awardsPoints
        ? params.correctCount * COINS_PER_CORRECT_ANSWER
        : 0;

      const experience = user.experience + xpEarned;
      const level = Math.floor(experience / XP_PER_LEVEL) + 1;
      const leveledUp = level > user.level;
      const rating = user.rating + ratingEarned;
      const streak = this.computeStreakUpdate(
        user,
        this.normalizeTimezoneOffset(params.timezoneOffsetMinutes),
      );
      const goalReward = this.checkStreakGoalReward(user, streak.currentStreak);

      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          experience,
          level,
          rating,
          coins: { increment: coinsEarned + goalReward.coins },
          currentStreak: streak.currentStreak,
          longestStreak: streak.longestStreak,
          lastActivityDate: streak.lastActivityDate,
          ...(goalReward.reachedNow && { streakGoalRewardedAt: new Date() }),
        },
      });

      return {
        user: updated,
        leveledUp,
        ratingEarned,
        xpEarned,
        coinsEarned,
        streak: {
          current: streak.currentStreak,
          longest: streak.longestStreak,
          increased: streak.increased,
          goalDays: user.streakGoalDays,
          goalReachedNow: goalReward.reachedNow,
          goalCoinsEarned: goalReward.coins,
        },
      };
    });
  }

  /** A streak goal pays out once — the first time `newStreak` reaches it
   * while it hasn't already been rewarded. Shared by the chapter-check
   * reward path and by picking a goal that the current streak already meets. */
  private checkStreakGoalReward(
    user: User,
    newStreak: number,
  ): { reachedNow: boolean; coins: number } {
    if (
      user.streakGoalDays === null ||
      user.streakGoalRewardedAt !== null ||
      newStreak < user.streakGoalDays
    ) {
      return { reachedNow: false, coins: 0 };
    }
    const coins =
      STREAK_GOAL_COIN_REWARD[user.streakGoalDays as StreakGoalDays] ?? 0;
    return { reachedNow: true, coins };
  }

  /** Sets (or replaces) the user's streak-goal target. If the current
   * streak already meets it, the coin reward is granted immediately. */
  async setStreakGoal(userId: string, days: StreakGoalDays): Promise<User> {
    return this.withUserLock(userId, async (tx, user) => {
      // Re-picking the same goal that's already been rewarded is a no-op —
      // otherwise resubmitting the same choice would re-grant the coins.
      if (user.streakGoalDays === days && user.streakGoalRewardedAt !== null) {
        return user;
      }

      const goalReward = this.checkStreakGoalReward(
        { ...user, streakGoalDays: days, streakGoalRewardedAt: null },
        user.currentStreak,
      );

      return tx.user.update({
        where: { id: userId },
        data: {
          streakGoalDays: days,
          streakGoalRewardedAt: goalReward.reachedNow ? new Date() : null,
          ...(goalReward.coins > 0 && {
            coins: { increment: goalReward.coins },
          }),
        },
      });
    });
  }

  /** Clamps to the DTO's validated range and falls back to UTC (0) for a
   * client that didn't send one — old app builds, or a request from
   * somewhere that never asks. */
  private normalizeTimezoneOffset(minutes: number | undefined): number {
    if (minutes === undefined || !Number.isFinite(minutes)) return 0;
    return Math.max(-720, Math.min(840, Math.round(minutes)));
  }

  /**
   * Maps a real instant to the calendar-day label the player would read off
   * their own clock at that moment — a `Date` at UTC midnight of that day,
   * which is exactly what a Prisma `@db.Date` column stores (Postgres
   * `DATE` has no time-of-day at all, so this is the only representation
   * that round-trips through `lastActivityDate`). `timezoneOffsetMinutes`
   * uses the same sign convention as `Date.prototype.getTimezoneOffset()`
   * (positive = behind UTC, e.g. +300 for UTC-5). Passing 0 reproduces the
   * old UTC-only behavior exactly.
   */
  private localDateLabel(date: Date, timezoneOffsetMinutes: number): Date {
    const shifted = new Date(date.getTime() - timezoneOffsetMinutes * 60_000);
    return new Date(
      Date.UTC(
        shifted.getUTCFullYear(),
        shifted.getUTCMonth(),
        shifted.getUTCDate(),
      ),
    );
  }

  /**
   * Advances the streak by one calendar day in the player's own timezone,
   * resets on a missed day. Previously this always used UTC's midnight,
   * regardless of where the player actually is — fine for someone near
   * UTC, but unfair for anyone far from it: a consistent daily routine in,
   * say, UTC+10 doesn't line up with UTC's day boundary at all, so it could
   * cost a streak day (or fail to grant one) for no reason the player could
   * ever see or control. `timezoneOffsetMinutes` is whatever the client
   * most recently sent — see `SubmitChapterCheckAnswerDto`.
   */
  private computeStreakUpdate(
    user: User,
    timezoneOffsetMinutes: number,
  ): {
    currentStreak: number;
    longestStreak: number;
    lastActivityDate: Date;
    increased: boolean;
  } {
    const today = this.localDateLabel(new Date(), timezoneOffsetMinutes);

    if (!user.lastActivityDate) {
      return {
        currentStreak: 1,
        longestStreak: Math.max(1, user.longestStreak),
        lastActivityDate: today,
        increased: true,
      };
    }

    // `lastActivityDate` came back from a `@db.Date` column, so it's
    // already UTC-midnight-aligned to whatever day label it was stored
    // with — no further truncation needed before diffing.
    const last = user.lastActivityDate;
    const diffDays = Math.round(
      (today.getTime() - last.getTime()) / 86_400_000,
    );

    if (diffDays === 0) {
      return {
        currentStreak: user.currentStreak,
        longestStreak: user.longestStreak,
        lastActivityDate: today,
        increased: false,
      };
    }

    const currentStreak = diffDays === 1 ? user.currentStreak + 1 : 1;
    return {
      currentStreak,
      longestStreak: Math.max(user.longestStreak, currentStreak),
      lastActivityDate: today,
      increased: true,
    };
  }

  /**
   * Top players by rating, plus the current user's own rank when they fall
   * outside that top slice. Accounts that never finished onboarding
   * (no nickname) are excluded — they'd otherwise clutter the board.
   */
  async getLeaderboard(
    currentUserId: string,
  ): Promise<{ entries: LeaderboardEntry[]; me: LeaderboardEntry | null }> {
    const top = await this.prisma.user.findMany({
      where: { nickname: { not: null } },
      orderBy: [{ rating: 'desc' }, { createdAt: 'asc' }],
      take: LEADERBOARD_SIZE,
    });

    const entries = top.map((user, index) =>
      this.toLeaderboardEntry(user, index + 1, currentUserId),
    );

    if (entries.some((entry) => entry.isMe)) {
      return { entries, me: null };
    }

    const currentUser = await this.findById(currentUserId);
    if (!currentUser.nickname) {
      return { entries, me: null };
    }

    const higherRanked = await this.prisma.user.count({
      where: {
        nickname: { not: null },
        OR: [
          { rating: { gt: currentUser.rating } },
          {
            rating: currentUser.rating,
            createdAt: { lt: currentUser.createdAt },
          },
        ],
      },
    });

    return {
      entries,
      me: this.toLeaderboardEntry(currentUser, higherRanked + 1, currentUserId),
    };
  }

  private toLeaderboardEntry(
    user: User,
    rank: number,
    currentUserId: string,
  ): LeaderboardEntry {
    return {
      rank,
      id: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      country: user.country,
      level: user.level,
      rating: user.rating,
      title: getTitleForRating(user.rating),
      gamesWon: user.gamesWon,
      gamesLost: user.gamesLost,
      isMe: user.id === currentUserId,
    };
  }

  toProfile(user: User): UserProfile {
    // gamesPlayed also counts solo games, which never set an outcome (only
    // duels do) — dividing by it would silently deflate the rate with games
    // that were never "won" or "lost" to begin with. Decisive duels only.
    const decidedDuels = user.gamesWon + user.gamesLost;
    const winRate =
      decidedDuels > 0 ? Math.round((user.gamesWon / decidedDuels) * 100) : 0;

    return {
      id: user.id,
      telegramId: user.telegramId.toString(),
      telegramUsername: user.telegramUsername,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      country: user.country,
      language: user.language as LanguageCode,
      level: user.level,
      experience: user.experience,
      coins: user.coins,
      rating: user.rating,
      title: getTitleForRating(user.rating),
      gamesPlayed: user.gamesPlayed,
      duelsPlayed: user.duelsPlayed,
      gamesWon: user.gamesWon,
      gamesLost: user.gamesLost,
      gamesDrawn: user.gamesDrawn,
      winRate,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      streakGoalDays: user.streakGoalDays,
      streakGoalRewarded: user.streakGoalRewardedAt !== null,
      createdAt: user.createdAt.toISOString(),
      needsOnboarding: !user.nickname,
    };
  }
}
