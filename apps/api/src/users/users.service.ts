import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { LanguageCode, UserProfile } from '@bible-arena/shared';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateProfileDto } from './dto/update-profile.dto';

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
