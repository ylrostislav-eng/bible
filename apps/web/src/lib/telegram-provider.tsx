'use client';

import { expandViewport, init, isTMA, miniAppReady, mountMiniApp } from '@telegram-apps/sdk-react';
import { useEffect } from 'react';

/**
 * Boots the Telegram Mini Apps SDK so it can handle native events (theme
 * changes, viewport resizes, back button, etc), expands to full height, and
 * signals readiness to Telegram. No-ops outside Telegram.
 */
export function TelegramProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!isTMA()) {
      return undefined;
    }

    const cleanup = init();

    mountMiniApp();
    miniAppReady();
    expandViewport();

    return cleanup;
  }, []);

  return <>{children}</>;
}
