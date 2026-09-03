import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BibleModule } from './bible/bible.module';
import { ChatModule } from './chat/chat.module';
import { validateEnv } from './config/env.validation';
import { FriendsModule } from './friends/friends.module';
import { GameModule } from './game/game.module';
import { HealthModule } from './health/health.module';
import { LearnModule } from './learn/learn.module';
import { AchievementsModule } from './achievements/achievements.module';
import { ModerationModule } from './moderation/moderation.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PresenceModule } from './presence/presence.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    // A general anti-abuse baseline for the whole API — generous enough
    // not to bother a real user, but it caps how fast any single client
    // can hammer an endpoint (e.g. guessing duel/room invite codes,
    // brute-forcing a room password). Individual endpoints can tighten
    // this further with `@Throttle(...)`.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    UsersModule,
    GameModule,
    BibleModule,
    LearnModule,
    PresenceModule,
    FriendsModule,
    ChatModule,
    NotificationsModule,
    ModerationModule,
    AchievementsModule,
    TelemetryModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
