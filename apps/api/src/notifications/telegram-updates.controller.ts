import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  TELEGRAM_WEBHOOK_PATH,
  TelegramUpdatesService,
} from './telegram-updates.service';

/**
 * Единственный эндпоинт приложения без входа по токену: сюда стучится
 * Telegram, у которого нашего токена нет и быть не может.
 *
 * Пускает внутрь только совпадение секрета из заголовка (см.
 * `TelegramUpdatesService`). Всё остальное — `401`, ничего не разбирая:
 * тело чужого запроса нам не интересно.
 *
 * Отвечаем `200` всегда, когда секрет сошёлся, и не ждём разбора. Telegram
 * повторяет доставку, на которую не ответили, а повтор «Старта» — это
 * второе такое же сообщение человеку.
 */
@Controller(TELEGRAM_WEBHOOK_PATH)
export class TelegramUpdatesController {
  constructor(private readonly updates: TelegramUpdatesService) {}

  // Заметно выше общего предела: доставки идут пачками, когда боту пишут
  // несколько человек сразу, а обрезать их значит потерять сообщение.
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @HttpCode(200)
  @Post()
  async receive(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: unknown,
  ): Promise<{ ok: true }> {
    if (!this.updates.verifySecret(secret)) {
      throw new UnauthorizedException();
    }

    await this.updates.handleUpdate(update);
    return { ok: true };
  }
}
