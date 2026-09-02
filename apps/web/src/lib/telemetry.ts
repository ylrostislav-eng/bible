import { getAccessToken } from './api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// Dedupes identical reports within one tab session so a crash that
// re-fires on every render (an infinite error loop, a poll retrying a
// broken endpoint) doesn't flood the telemetry table with copies of the
// same row — the summary endpoint already groups by signature server-side,
// this just avoids the network chatter.
const reportedThisSession = new Set<string>();

/**
 * Best-effort client-error reporter: never throws, never blocks the
 * caller, and works whether or not the user is logged in yet (the backend
 * endpoint accepts anonymous reports). `kind` is a short machine tag for
 * grouping — see `ErrorReport.kind` in the Prisma schema for the
 * established vocabulary.
 */
export function reportClientError(
  kind: string,
  message: string,
  extra?: { stack?: string; [key: string]: unknown },
): void {
  const dedupeKey = `${kind}:${message}`;
  if (reportedThisSession.has(dedupeKey)) return;
  reportedThisSession.add(dedupeKey);

  const token = getAccessToken();
  const { stack, ...rest } = extra ?? {};

  void fetch(`${API_URL}/telemetry/client-error`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      kind,
      message: message.slice(0, 2000),
      stack,
      path: typeof window !== 'undefined' ? window.location.pathname : undefined,
      extra: Object.keys(rest).length > 0 ? rest : undefined,
    }),
    keepalive: true,
  }).catch(() => {
    // Reporting the error that reporting failed would just recurse.
  });
}
