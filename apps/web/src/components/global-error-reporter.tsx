'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/telemetry';

/** Registers window-level error/rejection listeners once — the last
 * safety net for exceptions that happen outside React's render cycle
 * (event handlers, timers, promises) and so never reach `ErrorBoundary`. */
export function GlobalErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportClientError('client_unhandled', event.message, {
        stack: event.error?.stack,
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      reportClientError('client_unhandledrejection', message, {
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
