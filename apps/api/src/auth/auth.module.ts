import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { FriendsModule } from '../friends/friends.module';
import { PresenceModule } from '../presence/presence.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TelegramAuthService } from './telegram-auth.service';

@Module({
  imports: [
    UsersModule,
    PresenceModule,
    FriendsModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        // `ms`'s StringValue type is too narrow to express cleanly here; the
        // value is already validated as a string by env.validation.ts.
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN') as never,
          algorithm: 'HS256',
        },
        /**
         * Алгоритм проверки задан явно, а не «какой окажется в токене».
         *
         * Заголовок токена присылает клиент, и разбор «по заголовку» —
         * классическая дыра: подпись проверяется тем способом, который
         * выбрал нападающий. Наш секрет симметричный, поэтому подстановка
         * `none` или `RS256` тут и так не сработала бы, но полагаться на
         * это — значит держать защиту на побочном свойстве библиотеки, а
         * не на своём решении.
         */
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TelegramAuthService],
})
export class AuthModule {}
