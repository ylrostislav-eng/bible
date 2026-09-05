'use client';

import type { AuthResponse, UpdateProfileInput, UserProfile } from '@bible-arena/shared';
import { retrieveRawInitData } from '@telegram-apps/sdk-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, apiClient, setAccessToken, setSessionRecovery } from './api';

type AuthStatus = 'loading' | 'no-telegram' | 'authenticated' | 'error';

interface AuthContextValue {
  status: AuthStatus;
  user: UserProfile | null;
  errorMessage: string | null;
  retry: () => void;
  /** Local-development-only login bypass; the backend rejects it in production. */
  devLogin: () => void;
  updateProfile: (input: UpdateProfileInput) => Promise<void>;
  /** Sets, changes or clears the guardian PIN. `pin: null` clears it;
   * `currentPin` is required whenever one is already set. */
  updateGuardianPin: (input: { pin: string | null; currentPin?: string }) => Promise<void>;
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
    return apiClient.post<AuthResponse>('/auth/telegram', { initData });
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

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      errorMessage,
      retry,
      devLogin,
      updateProfile,
      updateGuardianPin,
    }),
    [status, user, errorMessage, retry, devLogin, updateProfile, updateGuardianPin],
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
