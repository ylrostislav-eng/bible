import { AuthGate } from '@/components/auth-gate';
import { ScreenGlow } from '@/components/ui/screen-glow';
import { ScreenTransition } from '@/components/ui/screen-transition';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      {/* Свет лежит снаружи перехода: он должен переливаться из цвета в
          цвет, а не появляться заново вместе с содержимым. */}
      <ScreenGlow />
      <ScreenTransition>{children}</ScreenTransition>
    </AuthGate>
  );
}
