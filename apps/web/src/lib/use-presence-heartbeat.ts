'use client';

import { useEffect } from 'react';
import { apiClient } from './api';

/** Redis presence (`presence:<userId>`) has a 60s TTL and is only ever set
 * on login otherwise — without a periodic ping it looks like everyone signs
 * off a minute after opening the app. Mounted once, only while the user is
 * authenticated (see `AuthGate`). */
const HEARTBEAT_INTERVAL_MS = 40_000;

export function usePresenceHeartbeat(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return undefined;

    const ping = () => {
      void apiClient.post('/presence/ping').catch(() => {
        // Best-effort — a missed ping just means the TTL runs out sooner.
      });
    };

    ping();
    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled]);
}
