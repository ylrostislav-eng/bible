import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class TelegramLoginDto {
  @IsString()
  @MinLength(1)
  initData!: string;

  /**
   * Параметр запуска мини-приложения (`startapp` в ссылке).
   *
   * Сейчас через него приходит приглашение вида `ref_<id>` — см.
   * `AuthService.loginWithTelegram`. Необязателен и намеренно не разбирается
   * здесь: DTO проверяет только форму, а смысл строки — дело сервиса.
   *
   * Длина ограничена тем же, что и у Telegram: параметр приходит от клиента,
   * и без предела сюда можно прислать мегабайт.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  startParam?: string;
}
