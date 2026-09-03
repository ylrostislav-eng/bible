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

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
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
