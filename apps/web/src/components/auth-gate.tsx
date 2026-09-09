'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { ActiveGameProvider } from '@/lib/active-game-context';
import { useAuth } from '@/lib/auth-context';
import { DeclineNoticesProvider } from '@/lib/decline-notices-context';
import { ImmersiveProvider, useImmersive } from '@/lib/immersive-context';
import { IncomingChallengesProvider } from '@/lib/incoming-challenges-context';
import { IncomingRoomInvitesProvider } from '@/lib/incoming-room-invites-context';
import { usePresenceHeartbeat } from '@/lib/use-presence-heartbeat';
import { DeclineNoticeToast } from './decline-notice-toast';
import { IncomingNotifications } from './incoming-notifications';
import { LaunchInviteNotice } from './launch-invite-notice';
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
      <div className="flex min-h-[var(--app-height)] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (status === 'no-telegram') {
    return (
      <div className="flex min-h-[var(--app-height)] flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-lg font-semibold">Откройте «Библейскую арену» в Telegram</p>
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
      <div className="flex min-h-[var(--app-height)] flex-col items-center justify-center gap-4 px-6 text-center">
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
              <ImmersiveProvider>
                <AppChrome>{children}</AppChrome>
              </ImmersiveProvider>
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

  // Погружённый экран не получает отступов — и это важно, а не лень.
  //
  // Такие экраны высотой ровно в окно (`--app-height`), и отступ снаружи
  // прибавляется к этой высоте, а не входит в неё: низ уезжает за край.
  // Живой баг: обёртка `pt-safe` здесь срезала кнопки «Пропустить» и
  // «Угадали» в раунде Alias.
  //
  // Поэтому безопасную зону такие экраны учитывают внутри себя — рамка
  // считается по `border-box`, и там отступ входит в высоту, а не
  // добавляется к ней.
  //
  // **Обёртка при этом остаётся на месте всегда, меняются только её
  // классы.** Раньше в погружённом режиме `AppChrome` возвращал голый
  // фрагмент, и React считал это другим деревом: при включении режима
  // экран **перемонтировался** и терял всё своё состояние. Для Alias это
  // было незаметно — он просит полноэкранный режим сразу и навсегда. А
  // «Кости» просят его, только когда началась партия, и получалось
  // кольцо: партия → режим включён → перемонтирование → состояние
  // сброшено, партии нет → режим выключен → перемонтирование → партия
  // подгружается снова. Экран мигал и не давал нажать ни одной кнопки.
  // _Нашлось живой проверкой: Playwright три раза подряд сообщил
  // «element was detached from the DOM»._
  return (
    <>
      {/* Отступ снизу закрывает не только навигацию, но и плавающие кнопки:
          музыка и приглашения стоят в 6rem от низа и сами высотой 3.5rem,
          то есть занимают до 9.5rem. _С прежними 6rem последняя карточка на
          прокрученной до конца странице оказывалась под ними, с обрезанным
          текстом._

          К этому добавляется безопасная зона: сами кнопки от неё уже
          отодвинуты, и без такой же прибавки здесь отступ снова стал бы
          коротким ровно на высоту домашней полоски. */}
      <div className={immersive ? undefined : 'pt-safe pb-[calc(var(--safe-bottom)+10rem)]'}>
        {children}
      </div>
      {!immersive && (
        <>
          <IncomingNotifications />
          <LaunchInviteNotice />
          <DeclineNoticeToast />
          <PendingInvitesWidget />
          <MusicWidget />
          <BottomNav />
        </>
      )}
    </>
  );
}
