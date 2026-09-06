import { AuthGate } from '@/components/auth-gate';
import { ScreenBackground } from '@/components/ui/screen-background';
import { ScreenGlow } from '@/components/ui/screen-glow';
import { ScreenTransition } from '@/components/ui/screen-transition';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Три слоя снизу вверх: обои режима (-z-20), сияние его цвета
          поверх них (-z-10), содержимое.

          Оба фоновых слоя стоят **снаружи** `AuthGate`, и это не стиль, а
          скорость. `AuthGate` до конца входа рендерит один спиннер, то
          есть всё, что лежит внутри него, не существует, пока приложение
          не сходит в Telegram за подписью и на наш сервер за токеном.
          Обои внутри означали, что картинка начинает грузиться после
          входа и приезжает заметно последней. Снаружи она есть в разметке
          сразу.

          Внутри перехода их тоже быть не должно: фон и свет переливаются
          из состояния в состояние, а не появляются заново вместе с
          содержимым. */}
      <ScreenBackground />
      <ScreenGlow />
      <AuthGate>
        <ScreenTransition>{children}</ScreenTransition>
      </AuthGate>
    </>
  );
}
