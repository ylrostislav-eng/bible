import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  LanguageCode,
  LeaderboardEntry,
  UserProfile,
} from '@bible-arena/shared';
import { getTitleForRating, XP_PER_LEVEL } from '@bible-arena/shared';
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
        throw new ConflictException('Nickname is already taken');
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        nickname: dto.nickname,
        avatarUrl: dto.avatarUrl,
        country: dto.country,
        language: dto.language,
      },
    });
  }

  /**
   * Call whenever the app is confirmed open (login, profile fetch). Applies
   * the inactivity rating decay once, lazily — there's no background job,
   * so a long absence is settled the moment the user comes back, not
   * day-by-day while they're gone. Skips the write entirely on repeat calls
   * within the same day so this doesn't hammer the DB on every request.
   */
  async touchActivity(userId: string): Promise<User> {
    const user = await this.findById(userId);
    const now = new Date();
    const daysSinceActive = Math.floor(
      (now.getTime() - user.lastActiveAt.getTime()) / 86_400_000,
    );

    if (daysSinceActive < 1) {
      return user;
    }
    if (daysSinceActive <= INACTIVITY_GRACE_DAYS) {
      return this.prisma.user.update({
        where: { id: userId },
        data: { lastActiveAt: now },
      });
    }

    const decayDays = daysSinceActive - INACTIVITY_GRACE_DAYS;
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        rating: user.rating - decayDays * INACTIVITY_DECAY_PER_DAY,
        lastActiveAt: now,
      },
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
    const user = await this.findById(userId);

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

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        experience,
        level,
        rating,
        coins: { increment: params.coinsEarned },
        gamesPlayed: { increment: 1 },
        ...(params.outcome === 'win' && { gamesWon: { increment: 1 } }),
        ...(params.outcome === 'loss' && { gamesLost: { increment: 1 } }),
        ...(params.cappedWin && { duelRatingWinsToday, duelRatingCapDate }),
      },
    });

    return { user: updated, leveledUp, ratingDelta, ratingCapped };
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
    params: { correctCount: number; wrongCount: number; awardsPoints: boolean },
  ): Promise<{
    user: User;
    leveledUp: boolean;
    ratingEarned: number;
    xpEarned: number;
    coinsEarned: number;
    streak: { current: number; longest: number; increased: boolean };
  }> {
    const user = await this.findById(userId);

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
    const streak = this.computeStreakUpdate(user);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        experience,
        level,
        rating,
        coins: { increment: coinsEarned },
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        lastActivityDate: streak.lastActivityDate,
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
      },
    };
  }

  /** Advances the streak by one calendar day (UTC), resets on a missed day. */
  private computeStreakUpdate(user: User): {
    currentStreak: number;
    longestStreak: number;
    lastActivityDate: Date;
    increased: boolean;
  } {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    if (!user.lastActivityDate) {
      return {
        currentStreak: 1,
        longestStreak: Math.max(1, user.longestStreak),
        lastActivityDate: today,
        increased: true,
      };
    }

    const last = new Date(user.lastActivityDate);
    last.setUTCHours(0, 0, 0, 0);
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
    const winRate =
      user.gamesPlayed > 0
        ? Math.round((user.gamesWon / user.gamesPlayed) * 1000) / 10
        : 0;

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
      gamesWon: user.gamesWon,
      gamesLost: user.gamesLost,
      winRate,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      createdAt: user.createdAt.toISOString(),
      needsOnboarding: !user.nickname,
    };
  }
}
