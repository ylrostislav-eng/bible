'use client';

import type { AuthResponse, UpdateProfileInput, UserProfile } from '@bible-arena/shared';
import { retrieveLaunchParams, retrieveRawInitData } from '@telegram-apps/sdk-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, apiClient, setAccessToken, setSessionRecovery } from './api';
import { askWriteAccess } from './write-access';

type AuthStatus = 'loading' | 'no-telegram' | 'authenticated' | 'error';

interface AuthContextValue {
  status: AuthStatus;
  user: UserProfile | null;
  errorMessage: string | null;
  retry: () => void;
  /** Local-development-only login bypass; the backend rejects it in production. */
  devLogin: () => void;
  updateProfile: (input: UpdateProfileInput) => Promise<void>;
  /**
   * Перечитывает профиль с сервера.
   *
   * Нужен там, где профиль меняется не самим профилем: монеты списывает
   * лавка, и без этого в шапке и на главной осталась бы прежняя цифра —
   * человек решил бы, что списали дважды.
   */
  refreshUser: () => Promise<void>;
  /** Sets, changes or clears the guardian PIN. `pin: null` clears it;
   * `currentPin` is required whenever one is already set. */
  updateGuardianPin: (input: { pin: string | null; currentPin?: string }) => Promise<void>;
  /**
   * Спрашивает у Telegram разрешение боту писать в личные сообщения и, если
   * разрешили, сообщает об этом серверу. Возвращает, разрешили ли.
   *
   * Живёт здесь, а не в экране, потому что меняет профиль: `canWriteToPm`
   * читают сразу несколько мест, и обновиться он должен всюду разом.
   */
  requestWriteAccess: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [useDevLogin, setUseDevLogin] = useState(false);

  const applySession = useCallback((response: AuthResponse) => {
    setAccessToken(response.accessToken);
    setUser(response.user);
    setStatus('authenticated');
  }, []);

  /**
   * Собственно вход — без единого касания состояния экрана.
   *
   * Отделён от `login` намеренно: тем же входом сессия восстанавливается
   * после истечения токена, и там показывать «Загрузка…» нельзя. Игрок в
   * этот момент посреди партии, и мигнувший экран входа он прочтёт как
   * вылет, даже если всё восстановилось за полсекунды.
   *
   * `null` означает «войти нечем» — приложение открыли не из Telegram.
   */
  const authenticate = useCallback(async (): Promise<AuthResponse | null> => {
    if (useDevLogin) {
      const slot = Number(new URLSearchParams(window.location.search).get('devSlot')) || 1;
      return apiClient.post<AuthResponse>('/auth/dev-login', { slot });
    }

    let initData: string | undefined;
    try {
      initData = retrieveRawInitData();
    } catch {
      initData = undefined;
    }
    if (!initData) return null;

    // Параметр запуска ссылки-приглашения (`?startapp=ref_<токен>`).
    // Читается на каждом входе, а не только на первом: связь создаёт сервер
    // и он же решает, что с ней делать — новичка сразу дружит с
    // пригласившим, у остальных заводит обычную заявку. Отсутствие
    // параметра — обычное дело, приложение чаще открывают кнопкой бота.
    //
    // Источников два, потому что и дорог сюда две. Прямая ссылка на
    // мини-приложение кладёт приглашение в параметр запуска Telegram. А
    // ссылка через бота приводит человека в переписку, и оттуда игру
    // открывает кнопка под ответом бота — она открывает приложение по
    // прямому адресу, где параметра запуска нет вовсе, и приглашение
    // приезжает обычным `?invite=` (см. `TelegramUpdatesService`).
    // Забыть второй источник значит потерять дружбу ровно у тех, кто пришёл
    // по приглашению впервые, — и не заметить этого.
    let startParam: string | undefined;
    try {
      startParam =
        new URLSearchParams(window.location.search).get('invite') ??
        retrieveLaunchParams(true).tgWebAppStartParam;
    } catch {
      startParam = undefined;
    }

    return apiClient.post<AuthResponse>('/auth/telegram', {
      initData,
      startParam,
    });
  }, [useDevLogin]);

  useEffect(() => {
    let cancelled = false;

    async function login() {
      setStatus('loading');
      setErrorMessage(null);
      try {
        const response = await authenticate();
        if (cancelled) return;
        if (!response) {
          setStatus('no-telegram');
          return;
        }
        applySession(response);
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Не удалось подключиться к серверу';
        setErrorMessage(message);
        setStatus('error');
      }
    }

    void login();

    return () => {
      cancelled = true;
    };
  }, [attempt, authenticate, applySession]);

  // Токен доступа живёт пятнадцать минут. Чтобы это не выбрасывало игрока
  // на экран входа посреди партии, `apiClient` при отказе по сроку зовёт
  // отсюда тот же вход и повторяет запрос. Молча: экран не меняется.
  useEffect(() => {
    setSessionRecovery(async () => {
      try {
        const response = await authenticate();
        if (!response) return null;
        applySession(response);
        return response.accessToken;
      } catch {
        // Не вышло — пусть исходный отказ дойдёт до вызвавшего как есть.
        return null;
      }
    });
    return () => setSessionRecovery(null);
  }, [authenticate, applySession]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const devLogin = useCallback(() => setUseDevLogin(true), []);

  const refreshUser = useCallback(async () => {
    // Молча: это обновление ради свежей цифры, и уронить из-за него экран
    // хуже, чем показать цифру постарше.
    try {
      setUser(await apiClient.get<UserProfile>('/users/me'));
    } catch {
      // оставляем прежний профиль
    }
  }, []);

  const updateProfile = useCallback(async (input: UpdateProfileInput) => {
    const profile = await apiClient.patch<UserProfile>('/users/me', input);
    setUser(profile);
  }, []);

  const updateGuardianPin = useCallback(
    async (input: { pin: string | null; currentPin?: string }) => {
      const profile = await apiClient.patch<UserProfile>('/users/me/guardian-pin', input);
      setUser(profile);
    },
    [],
  );

  const requestWriteAccess = useCallback(async () => {
    const allowed = await askWriteAccess();
    if (!allowed) return false;
    // Отдельным запросом, потому что ответ Telegram получает приложение, а
    // не сервер: в `initData` этого запуска флаг уже не появится.
    try {
      setUser(await apiClient.post<UserProfile>('/users/me/write-access', {}));
    } catch {
      // Разрешение уже дано — сервер узнает о нём на следующем входе из
      // `initData`. Ронять экран из-за не дошедшей отметки нечестно: с
      // точки зрения игрока он всё сделал.
    }
    return true;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      errorMessage,
      retry,
      devLogin,
      refreshUser,
      updateProfile,
      updateGuardianPin,
      requestWriteAccess,
    }),
    [
      status,
      user,
      errorMessage,
      retry,
      devLogin,
      refreshUser,
      updateProfile,
      updateGuardianPin,
      requestWriteAccess,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
