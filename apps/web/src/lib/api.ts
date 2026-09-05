const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Used for the room WebSocket handshake, which can't attach an
 * `Authorization` header the way `apiClient` does. */
export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * Как войти заново, когда токен истёк.
 *
 * Токен доступа живёт пятнадцать минут вместо прежних тридцати дней —
 * утёкший больше не открывает аккаунт на месяц. Расплатой за это был бы
 * выброс на экран входа посреди партии, и вот его здесь и нет: клиент
 * молча повторяет тот же вход, каким зашёл (данные Telegram или
 * dev-слот), и доигрывает запрос.
 *
 * Ставит сюда функцию `AuthProvider` — только он знает, каким способом
 * этот игрок вошёл.
 */
type SessionRecovery = () => Promise<string | null>;

let recoverSession: SessionRecovery | null = null;
/** Один общий вход на все запросы, упавшие разом: иначе десяток
 *  параллельных опросов устроит десяток одновременных входов. */
let recoveryInFlight: Promise<string | null> | null = null;

export function setSessionRecovery(recovery: SessionRecovery | null): void {
  recoverSession = recovery;
}

/**
 * Обновить сессию не дожидаясь отказа.
 *
 * Нужно сокетам: у них нет заголовка и нет ответа с кодом 401 — сервер
 * просто отказывает в рукопожатии. Партия в «Горячо-холодно» идёт до
 * двадцати пяти минут, дольше срока токена, и обрыв связи в дороге —
 * обычное дело: без этого переподключение упиралось бы в протухший
 * токен и партия обрывалась бы на ровном месте.
 */
export async function refreshSession(): Promise<string | null> {
  return recoverOnce(accessToken);
}

/**
 * Вернуть рабочий токен: либо тот, что уже обновили без нас, либо новый.
 *
 * Проверка `usedToken` — про опоздавший отказ. Запросы уходят пачками
 * (фоновые опросы приглашений, вызовов и уведомлений идут разом), и те
 * из них, что успели уйти со старым токеном, возвращаются уже **после**
 * того, как сессию восстановил кто-то другой. Такому запросу вход не
 * нужен — нужен токен, который уже лежит рядом.
 *
 * Живая проверка при сроке токена в двадцать секунд: пачка из пяти-шести
 * отказов даёт ровно один вход, и входы идут строго по одному на каждое
 * истечение.
 */
async function recoverOnce(usedToken: string | null): Promise<string | null> {
  if (accessToken && accessToken !== usedToken) return accessToken;
  if (!recoverSession) return null;
  recoveryInFlight ??= recoverSession().finally(() => {
    recoveryInFlight = null;
  });
  return recoveryInFlight;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  // Каким токеном ушёл этот запрос — понадобится, если он вернётся с
  // отказом уже после того, как сессию восстановили без нас.
  const usedToken = accessToken;
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        // The player's own UTC offset. The daily streak rolls over at their
        // midnight, and the modes that finish server-side (a duel, a room
        // match) have no request of theirs to read a clock from — so the
        // server stores whatever this header last said.
        'X-Timezone-Offset': String(new Date().getTimezoneOffset()),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    // A thrown fetch (offline, DNS failure, CORS) is not an ApiError —
    // rethrown as-is so existing `err instanceof ApiError` callers keep
    // falling back to their generic message exactly as before; telemetry
    // is the only thing added here.
    const { reportClientError } = await import('./telemetry');
    reportClientError('api_network_failure', err instanceof Error ? err.message : String(err), {
      method,
      apiPath: path,
    });
    throw err;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    // Истёкший токен — не ошибка для игрока: входим заново и доигрываем
    // запрос. Сам вход из этого исключён, иначе неудачный вход вызывал бы
    // вход, и так по кругу; повтор ровно один по той же причине.
    if (response.status === 401 && retry && !path.startsWith('/auth/')) {
      const renewed = await recoverOnce(usedToken);
      if (renewed) return request<T>(method, path, body, false);
    }

    const message =
      (payload && typeof payload === 'object' && 'message' in payload && String(payload.message)) ||
      response.statusText;
    if (response.status >= 500) {
      const { reportClientError } = await import('./telemetry');
      reportClientError('api_5xx_response', message, {
        method,
        apiPath: path,
        status: response.status,
      });
    }
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
