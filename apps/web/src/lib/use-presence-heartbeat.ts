'use client';

import { useEffect } from 'react';
import { apiClient } from './api';

/** Redis presence (`presence:<userId>`) has a 60s TTL and is only ever set
 * on login otherwise — without a periodic ping it looks like everyone signs
 * off a minute after opening the app. Mounted once, only while the user is
 * authenticated (see `AuthGate`). */
const HEARTBEAT_INTERVAL_MS = 40_000;

/**
 * «В сети» — это «смотрит в экран», а не «приложение не закрыто».
 *
 * Различие стало важным, когда появились уведомления о приглашениях: они
 * намеренно не отправляются тому, кто в сети, — он и так видит попап.
 * Пока сердцебиение стучало в фоне, свёрнутое мини-приложение держало
 * человека «в сети» бесконечно: попапа он не видел, уведомления не
 * получал. _Живой случай: уведомления перестали приходить совсем, и по
 * логам это выглядело как «сообщений просто нет» — отправка ведь даже не
 * начиналась._
 *
 * Поэтому пинг идёт только при видимой вкладке. Свернули приложение —
 * через минуту присутствие истекает само, и человек снова достижим
 * сообщением. Вернулись — пинг сразу же, без ожидания следующего такта:
 * иначе первую минуту после возвращения он всё ещё «не в сети».
 */
export function usePresenceHeartbeat(enabled: boolean): void {
  useEffect(() => {
    if (enabled !== true) return undefined;

    const ping = () => {
      if (document.visibilityState !== 'visible') return;
      void apiClient.post('/presence/ping').catch(() => {
        // Best-effort — a missed ping just means the TTL runs out sooner.
      });
    };

    ping();
    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    document.addEventListener('visibilitychange', ping);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', ping);
    };
  }, [enabled]);
}
