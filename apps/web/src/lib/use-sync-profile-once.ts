import { useCallback, useState } from 'react';
import { useAuth } from './auth-context';
import { reportClientError } from './telemetry';

/**
 * Refreshes the global profile (the XP/level/coins/rating shown elsewhere
 * in the app — bottom nav, profile tab) once a game finishes. A failure
 * here doesn't lose anything: the reward numbers on the result screen
 * itself come straight from the game's own state, not from this — but it
 * leaves the rest of the app showing pre-match numbers until something
 * else happens to refresh them, with nothing telling the user that's what
 * happened. Callers should render `syncFailed` as a small, low-alarm note
 * rather than let the mismatch pass silently.
 */
export function useSyncProfileOnce() {
  const { updateProfile } = useAuth();
  const [syncFailed, setSyncFailed] = useState(false);

  const syncProfile = useCallback(() => {
    updateProfile({}).catch((err) => {
      setSyncFailed(true);
      reportClientError(
        'profile_sync_after_game_failed',
        err instanceof Error ? err.message : String(err),
      );
    });
  }, [updateProfile]);

  return { syncProfile, syncFailed };
}
