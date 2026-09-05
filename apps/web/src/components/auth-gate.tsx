'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { ActiveGameProvider } from '@/lib/active-game-context';
import { useAuth } from '@/lib/auth-context';
import { ChatProvider } from '@/lib/chat-context';
import { DeclineNoticesProvider } from '@/lib/decline-notices-context';
import { ImmersiveProvider, useImmersive } from '@/lib/immersive-context';
import { IncomingChallengesProvider } from '@/lib/incoming-challenges-context';
import { IncomingRoomInvitesProvider } from '@/lib/incoming-room-invites-context';
import { usePresenceHeartbeat } from '@/lib/use-presence-heartbeat';
import { ChatWidget } from './chat-widget';
import { DeclineNoticeToast } from './decline-notice-toast';
import { IncomingNotifications } from './incoming-notifications';
import { BottomNav } from './navigation/bottom-nav';
import { TextScaleProvider } from './text-scale-provider';
import { MusicWidget } from './music-widget';
import { PendingInvitesWidget } from './pending-invites-widget';
import { AgeBandGate } from './onboarding/age-band-gate';
import { OnboardingForm } from './onboarding/onboarding-form';
import { Button } from './ui/button';
import { Spinner } from './ui/spinner';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status, user, errorMessage, retry, devLogin } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const redirectedHome = useRef(false);
  usePresenceHeartbeat(status === 'authenticated' && !user?.needsOnboarding);

  // A fresh launch of the app should always start on the home screen, not
  // wherever the URL happens to point — e.g. Telegram resuming a
  // backgrounded WebView on whatever in-app route it last showed, or a
  // plain browser refresh on a deep link while testing. Fires at most once
  // per real app load (the ref guard, not the effect's own re-runs, is
  // what enforces that) — every navigation after this one is a deliberate
  // in-app click and must not be bounced back.
  useEffect(() => {
    if (redirectedHome.current) return;
    if (status !== 'authenticated' || user?.needsOnboarding) return;
    redirectedHome.current = true;
    if (pathname !== '/') router.replace('/');
  }, [status, user?.needsOnboarding, pathname, router]);

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

  // Accounts that finished onboarding before the age question existed get
  // asked once, here, rather than being quietly left without a band.
  if (user && !user.ageBand) {
    return <AgeBandGate />;
  }

  return (
    <TextScaleProvider>
      <ActiveGameProvider>
        <IncomingChallengesProvider>
          <IncomingRoomInvitesProvider>
            <DeclineNoticesProvider>
              <ChatProvider>
                <ImmersiveProvider>
                  <AppChrome>{children}</AppChrome>
                </ImmersiveProvider>
              </ChatProvider>
            </DeclineNoticesProvider>
          </IncomingRoomInvitesProvider>
        </IncomingChallengesProvider>
      </ActiveGameProvider>
    </TextScaleProvider>
  );
}

/**
 * Собственный хром приложения: отступы под плавающие элементы, нижняя
 * навигация, виджеты и уведомления. В полноэкранном режиме не рендерится
 * ничего из этого — экран целиком отдан тому, что на нём происходит.
 */
function AppChrome({ children }: { children: React.ReactNode }) {
  const { immersive } = useImmersive();

  if (immersive) return <>{children}</>;

  return (
    <>
      {/* Bottom padding has to clear the floating widgets, not just the
        nav bar: the chat and room-invite buttons sit at bottom-24 and
        are 56px tall, so they occupy up to 152px from the bottom.
        With the old pb-24 (96px) the last card on a fully scrolled
        page ended up underneath them, with its text cut off. */}
      <div className="pt-safe pb-40">{children}</div>
      <IncomingNotifications />
      <DeclineNoticeToast />
      <PendingInvitesWidget />
      <ChatWidget />
      <MusicWidget />
      <BottomNav />
    </>
  );
}
