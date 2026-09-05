'use client';

import { usePathname } from 'next/navigation';
import { modeTheme } from '@/lib/mode-theme';

/**
 * Свет над экраном.
 *
 * Приложение было плоским: один и тот же почти чёрный фон под всеми
 * экранами, и режимы отличались только текстом на карточках. Здесь
 * добавляется мягкое сияние в цвете режима — сверху, где обычно
 * заголовок, и едва заметное внизу, чтобы низ не выглядел обрезанным.
 *
 * ## Что здесь важно не сломать
 *
 * - **Это фон, а не украшение поверх.** `fixed` и `-z-10`: слой лежит под
 *   всем содержимым и не перехватывает нажатия (`pointer-events-none`).
 * - **Контраст текста не трогается.** Сияние держится в пределах 19%
 *   непрозрачности. Карточкам оно не мешает вовсе — они непрозрачные, —
 *   а на голом фоне лежат только заголовки и подписи, и для них запас
 *   по контрасту тут больше двукратного. Выше поднимать нельзя: дальше
 *   начинает страдать приглушённый текст, который сюда возвращали
 *   отдельной работой.
 * - **Смена цвета плавная.** Переход между экранами не должен мигать
 *   цветом, поэтому оттенок едет секунду, а не переключается.
 */
export function ScreenGlow() {
  const pathname = usePathname();
  const { accent, glow } = modeTheme(pathname);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 transition-[background] duration-700"
      style={{
        background: [
          `radial-gradient(120% 45% at 50% -10%, ${accent}${alpha(glow)} 0%, transparent 70%)`,
          `radial-gradient(90% 35% at 50% 108%, ${accent}${alpha(glow * 0.45)} 0%, transparent 70%)`,
          'var(--color-bg)',
        ].join(', '),
      }}
    />
  );
}

/** Доля непрозрачности → две шестнадцатеричные цифры для записи цвета. */
function alpha(share: number): string {
  return Math.round(Math.min(1, Math.max(0, share)) * 255)
    .toString(16)
    .padStart(2, '0');
}
