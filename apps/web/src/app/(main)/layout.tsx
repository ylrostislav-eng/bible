import { AuthGate } from '@/components/auth-gate';
import { ScreenBackground } from '@/components/ui/screen-background';
import { ScreenGlow } from '@/components/ui/screen-glow';
import { ScreenTransition } from '@/components/ui/screen-transition';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      {/* Три слоя снизу вверх: обои режима (-z-20), сияние его цвета
          поверх них (-z-10), содержимое. Обои и свет лежат снаружи
          перехода намеренно: они должны переливаться из состояния в
          состояние, а не появляться заново вместе с содержимым. */}
      <ScreenBackground />
      <ScreenGlow />
      <ScreenTransition>{children}</ScreenTransition>
    </AuthGate>
  );
}
