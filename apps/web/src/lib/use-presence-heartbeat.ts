'use client';

import { useEffect } from 'react';
import { apiClient, getAccessToken } from './api';

/** Redis presence (`presence:<userId>`) has a 60s TTL and is only ever set
 * on login otherwise — without a periodic ping it looks like everyone signs
 * off a minute after opening the app. Mounted once, only while the user is
 * authenticated (see `AuthGate`). */
const HEARTBEAT_INTERVAL_MS = 40_000;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

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
 * Поэтому пинг идёт только при видимой вкладке. А уход отмечается сразу и
 * явно, а не ожиданием, пока истечёт минута: минута молчания заметно
 * врёт. _Второй живой случай: владелец вышел с одного аккаунта, вошёл с
 * другого — и видел себя прежнего в сети._ Истечение по времени осталось
 * страховкой на случай, когда сказать «ухожу» не успели.
 */
export function usePresenceHeartbeat(enabled: boolean): void {
  useEffect(() => {
    if (enabled !== true) return undefined;

    const ping = () => {
      void apiClient.post('/presence/ping').catch(() => {
        // Best-effort — a missed ping just means the TTL runs out sooner.
      });
    };

    /**
     * «Ухожу» — обычным `fetch` с `keepalive`, а не `apiClient`.
     *
     * Запрос отправляется в тот момент, когда страница уже уходит, и
     * обычный запрос браузер в этот момент отменяет. `keepalive` — то, что
     * позволяет ему договорить. `sendBeacon` сюда не годится: он не умеет
     * заголовков, а нам нужен `Authorization`.
     */
    const goOffline = () => {
      const token = getAccessToken();
      if (!token) return;
      try {
        void fetch(`${API_URL}/presence/offline`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          keepalive: true,
        }).catch(() => {
          // Не дошло — остаётся истечение по времени.
        });
      } catch {
        // То же самое: присутствие никогда не мешает жить приложению.
      }
    };

    const sync = () => {
      if (document.visibilityState === 'visible') ping();
      else goOffline();
    };

    sync();
    const interval = setInterval(sync, HEARTBEAT_INTERVAL_MS);
    document.addEventListener('visibilitychange', sync);
    // `pagehide`, а не `beforeunload`: на телефонах второй часто не
    // приходит вовсе, а первый срабатывает и при уходе вкладки в кеш.
    window.addEventListener('pagehide', goOffline);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('pagehide', goOffline);
      // Размонтирование — это выход из аккаунта или закрытие приложения:
      // в обоих случаях человек больше не в сети.
      goOffline();
    };
  }, [enabled]);
}
