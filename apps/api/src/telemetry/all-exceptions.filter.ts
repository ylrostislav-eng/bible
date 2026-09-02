import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Request } from 'express';
import { TelemetryService } from './telemetry.service';

/**
 * Replaces Nest's default exception handling app-wide so every unhandled
 * exception and every 5xx response gets a row in error telemetry before
 * the normal response is sent — the backend half of "bugs land somewhere
 * I always know to look" instead of only surfacing via a user report.
 * Client-facing behavior (status code, response body shape) is unchanged;
 * only the extra logging is new.
 */
@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly telemetryService: TelemetryService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const rawResponse = isHttpException ? exception.getResponse() : null;
    const responseBody =
      typeof rawResponse === 'string'
        ? { statusCode: status, message: rawResponse }
        : rawResponse && typeof rawResponse === 'object'
          ? { statusCode: status, ...rawResponse }
          : { statusCode: status, message: 'Internal server error' };

    if (status >= 500) {
      const message =
        exception instanceof Error ? exception.message : String(exception);
      const stack =
        exception instanceof Error ? (exception.stack ?? null) : null;
      const user = request?.user;
      void this.telemetryService.record({
        source: 'API',
        kind: isHttpException ? 'http_5xx' : 'unhandled_exception',
        message,
        stack,
        statusCode: status,
        path: request?.originalUrl ?? request?.url,
        method: request?.method,
        userId: user?.sub,
      });
    }

    httpAdapter.reply(ctx.getResponse(), responseBody, status);
  }
}
