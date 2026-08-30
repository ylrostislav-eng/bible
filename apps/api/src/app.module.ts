import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BibleModule } from './bible/bible.module';
import { validateEnv } from './config/env.validation';
import { FriendsModule } from './friends/friends.module';
import { GameModule } from './game/game.module';
import { HealthModule } from './health/health.module';
import { LearnModule } from './learn/learn.module';
import { PresenceModule } from './presence/presence.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
