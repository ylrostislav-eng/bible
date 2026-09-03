import type { ConfigService } from '@nestjs/config';

/**
 * WebSocket gateways can't restrict their `cors` origin the way `main.ts`
 * does for REST (`@WebSocketGateway`'s options are evaluated at class
 * decoration time, before `ConfigModule` has loaded `.env` — so
 * `ConfigService` isn't available yet). Both room and chat clients connect
 * with `transports: ['websocket']` only, so the `cors` option's
 * `Access-Control-Allow-Origin` header is moot anyway (browsers don't apply
 * CORS to a raw WebSocket handshake, only to the XHR-polling transport this
 * app never uses) — the actual gate is here, checked once `handleConnection`
 * runs, well after the app (and `ConfigService`) has fully booted.
 *
 * Best-effort by nature: CORS/Origin is a browser-enforced concept, so a
 * non-browser client can always omit or fake the header. A connection with
 * no `Origin` header at all (Telegram's WebView, a native/server client) is
 * let through rather than rejected — requiring one would just as easily
 * break a legitimate non-browser caller as stop a hostile one.
 */
export function isAllowedWsOrigin(
  origin: string | undefined,
  configService: ConfigService,
): boolean {
  if (!origin) return true;
  const allowed = configService.get<string>('CORS_ORIGIN');
  return !allowed || origin === allowed;
}
