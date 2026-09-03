'use client';

import type { AuthResponse, UpdateProfileInput, UserProfile } from '@bible-arena/shared';
import { retrieveRawInitData } from '@telegram-apps/sdk-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, apiClient, setAccessToken } from './api';

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

  useEffect(() => {
    let cancelled = false;

    async function login() {
      setStatus('loading');
      setErrorMessage(null);

      if (useDevLogin) {
        try {
          const slot = Number(new URLSearchParams(window.location.search).get('devSlot')) || 1;
          const response = await apiClient.post<AuthResponse>('/auth/dev-login', { slot });
          if (!cancelled) applySession(response);
        } catch (error) {
          if (cancelled) return;
          setErrorMessage(error instanceof ApiError ? error.message : 'Не удалось войти');
          setStatus('error');
        }
        return;
      }

      let initData: string | undefined;
      try {
        initData = retrieveRawInitData();
      } catch {
        initData = undefined;
      }

      if (!initData) {
        if (!cancelled) setStatus('no-telegram');
        return;
      }

      try {
        const response = await apiClient.post<AuthResponse>('/auth/telegram', { initData });
        if (!cancelled) applySession(response);
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
  }, [attempt, useDevLogin, applySession]);

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
