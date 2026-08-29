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
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateProfileDto } from './dto/update-profile.dto';

/** XP required per level; level = floor(experience / XP_PER_LEVEL) + 1. */
const XP_PER_LEVEL = 100;
const LEADERBOARD_SIZE = 50;

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
   * Applies XP/coin rewards from a finished game and recalculates level.
   * `outcome`/`ratingDelta` only apply to competitive modes (duels) — solo
   * games leave gamesWon/gamesLost/rating untouched.
   */
  async applyGameRewards(
    userId: string,
    params: {
      xpEarned: number;
      coinsEarned: number;
      outcome?: 'win' | 'loss' | 'draw';
      ratingDelta?: number;
    },
  ): Promise<{ user: User; leveledUp: boolean }> {
    const user = await this.findById(userId);
    const experience = user.experience + params.xpEarned;
    const level = Math.floor(experience / XP_PER_LEVEL) + 1;
    const leveledUp = level > user.level;
    const rating = Math.max(100, user.rating + (params.ratingDelta ?? 0));

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
      },
    });

    return { user: updated, leveledUp };
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
      gamesPlayed: user.gamesPlayed,
      gamesWon: user.gamesWon,
      gamesLost: user.gamesLost,
      winRate,
      createdAt: user.createdAt.toISOString(),
      needsOnboarding: !user.nickname,
    };
  }
}
