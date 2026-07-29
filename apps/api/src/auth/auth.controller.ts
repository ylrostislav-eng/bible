import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { TelegramLoginDto } from './dto/telegram-login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('telegram')
  login(@Body() dto: TelegramLoginDto) {
    return this.authService.loginWithTelegram(dto.initData);
  }

  /** Local-development-only login bypass — see AuthService.devLogin. */
  @Post('dev-login')
  devLogin() {
    return this.authService.devLogin();
  }
}
