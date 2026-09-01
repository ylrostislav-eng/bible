'use client';

import { ActiveGameProvider } from '@/lib/active-game-context';
import { useAuth } from '@/lib/auth-context';
import { ChatProvider } from '@/lib/chat-context';
import { IncomingChallengesProvider } from '@/lib/incoming-challenges-context';
import { IncomingRoomInvitesProvider } from '@/lib/incoming-room-invites-context';
import { usePresenceHeartbeat } from '@/lib/use-presence-heartbeat';
import { ChatWidget } from './chat-widget';
import { IncomingChallengeModal } from './incoming-challenge-modal';
import { IncomingRoomInviteModal } from './incoming-room-invite-modal';
import { BottomNav } from './navigation/bottom-nav';
import { RoomInvitesWidget } from './room-invites-widget';
import { OnboardingForm } from './onboarding/onboarding-form';
import { Button } from './ui/button';
import { Spinner } from './ui/spinner';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status, user, errorMessage, retry, devLogin } = useAuth();
  usePresenceHeartbeat(status === 'authenticated' && !user?.needsOnboarding);

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
    <ActiveGameProvider>
      <IncomingChallengesProvider>
        <IncomingRoomInvitesProvider>
          <ChatProvider>
            <div className="pt-safe pb-24">{children}</div>
            <IncomingChallengeModal />
            <IncomingRoomInviteModal />
            <RoomInvitesWidget />
            <ChatWidget />
            <BottomNav />
          </ChatProvider>
        </IncomingRoomInvitesProvider>
      </IncomingChallengesProvider>
    </ActiveGameProvider>
  );
}
