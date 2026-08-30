import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PresenceModule } from '../presence/presence.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TelegramAuthService } from './telegram-auth.service';

@Module({
  imports: [
    UsersModule,
    PresenceModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        // `ms`'s StringValue type is too narrow to express cleanly here; the
        // value is already validated as a string by env.validation.ts.
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN') as never,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TelegramAuthService],
})
export class AuthModule {}
