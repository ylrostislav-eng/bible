import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './telemetry/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  /**
   * Заголовки безопасности.
   *
   * Здесь их не было вовсе. Для API это не так громко, как для страницы —
   * ни форм, ни разметки сервер не отдаёт, — но три вещи важны и тут:
   *
   * - `X-Content-Type-Options: nosniff` — браузер не станет угадывать тип
   *   ответа. Без него ответ, который мы считаем JSON, при удачном стечении
   *   заголовков исполняется как скрипт.
   * - `Strict-Transport-Security` — после первого ответа браузер ходит
   *   только по https, и утечь по http токен уже не может.
   * - `Referrer-Policy` — адрес нашего API не уезжает в чужие логи.
   *
   * `contentSecurityPolicy` выключен намеренно: CSP имеет смысл там, где
   * отдаётся разметка, а сайт живёт отдельно (Next.js) и политику должен
   * задавать он. Оставлять здесь дефолтную политику helmet — значит
   * получить строчку, которая ничего не защищает и мешает читать, что
   * происходит.
   */
  app.use(
    helmet({
      contentSecurityPolicy: false,
      // Ответы API не встраиваются в чужие страницы, а `require-corp`
      // сломал бы обычную выдачу браузеру.
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Express по умолчанию представляется в каждом ответе. Знать версию
  // фреймворка нападающему полезнее, чем нам — сообщать её.
  app.disable('x-powered-by');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(app.get(AllExceptionsFilter));

  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN'),
    credentials: true,
  });

  const port = configService.get<number>('PORT') ?? 3001;
  await app.listen(port);
}
void bootstrap();
