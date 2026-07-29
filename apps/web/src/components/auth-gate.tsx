'use client';

import { useAuth } from '@/lib/auth-context';
import { BottomNav } from './navigation/bottom-nav';
import { OnboardingForm } from './onboarding/onboarding-form';
import { Button } from './ui/button';
import { Spinner } from './ui/spinner';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status, user, errorMessage, retry, devLogin } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (status === 'no-telegram') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-lg font-semibold">Откройте Bible Arena в Telegram</p>
        <p className="text-sm text-text-secondary">
          Это приложение работает только внутри Telegram Mini Apps.
        </p>
        {process.env.NODE_ENV !== 'production' && (
          <Button onClick={devLogin} className="mt-6 max-w-xs">
            Войти как тестовый пользователь (режим разработки)
          </Button>
        )}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-semibold">Не удалось войти</p>
        <p className="text-sm text-text-secondary">{errorMessage}</p>
        <Button onClick={retry} className="max-w-xs">
          Повторить
        </Button>
      </div>
    );
  }

  if (user?.needsOnboarding) {
    return <OnboardingForm />;
  }

  return (
    <>
      <div className="pt-safe pb-24">{children}</div>
      <BottomNav />
    </>
  );
}
