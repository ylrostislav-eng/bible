'use client';

import {
  bindViewportCssVars,
  expandViewport,
  init,
  isTMA,
  miniAppReady,
  mountMiniApp,
  mountViewport,
  requestFullscreen,
} from '@telegram-apps/sdk-react';
import { useEffect } from 'react';

/**
 * Поднимает SDK Telegram Mini Apps: родные события (тема, изменение
 * размеров, кнопка «назад»), полноэкранный режим и сигнал готовности.
 * Вне Telegram не делает ничего.
 *
 * ## Почему порядок именно такой
 *
 * `requestFullscreen` работает только после того, как смонтирован
 * вьюпорт, — иначе SDK бросает «parent component is not mounted».
 * Поэтому монтирование идёт первым и его приходится дожидаться, хотя
 * остальные вызовы синхронные.
 *
 * ## Зачем `bindViewportCssVars`
 *
 * В полноэкранном режиме родной шапки Telegram больше нет, и её место
 * занимают часы устройства и плавающие кнопки «закрыть» и «…». Без
 * отступов содержимое уезжает прямо под них. SDK публикует нужные числа
 * как CSS-переменные (`--tg-viewport-safe-area-inset-*` и
 * `--tg-viewport-content-safe-area-inset-*`), и ими пользуется утилита
 * `.pt-safe` в `globals.css`. Считать эти отступы в JS не нужно: они
 * меняются на повороте экрана и при смене клиента, а переменные
 * обновляются сами.
 *
 * ## Почему `expandViewport` остаётся
 *
 * Полноэкранный режим появился в Mini Apps 8.0. На клиентах постарше
 * `requestFullscreen` недоступен, и `ifAvailable` тихо ничего не делает —
 * там приложение должно хотя бы раскрыться на всю высоту, как раньше.
 */
export function TelegramProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!isTMA()) {
      return undefined;
    }

    const cleanup = init();

    mountMiniApp();
    miniAppReady();
    expandViewport();

    let unbindCssVars: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        if (mountViewport.isAvailable()) {
          await mountViewport();
        }
        // Экран мог смениться, пока ждали монтирования.
        if (cancelled) return;

        if (bindViewportCssVars.isAvailable()) {
          unbindCssVars = bindViewportCssVars();
        }
        await requestFullscreen.ifAvailable();
      } catch {
        // Отказ в полноэкранном режиме не повод ронять приложение: оно
        // остаётся работоспособным в обычном, просто с шапкой Telegram.
      }
    })();

    return () => {
      cancelled = true;
      unbindCssVars?.();
      cleanup();
    };
  }, []);

  return <>{children}</>;
}
