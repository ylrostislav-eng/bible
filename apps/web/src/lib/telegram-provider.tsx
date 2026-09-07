'use client';

import {
  bindViewportCssVars,
  disableVerticalSwipes,
  expandViewport,
  init,
  isFullscreen,
  isTMA,
  miniAppReady,
  mountMiniApp,
  mountSwipeBehavior,
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

    // Подъём SDK — под перехватом целиком.
    //
    // `isTMA()` отвечает «похоже на Telegram» по наличию параметров
    // запуска, а `init()` разбирает их всерьёз и может не согласиться:
    // урезанное окружение, старый клиент, обрезанная ссылка. Раньше это
    // исключение уходило наружу из эффекта, и вместо приложения человек
    // получал экран «Что-то пошло не так» — целиком, не только без
    // родных возможностей Telegram.
    //
    // _Поймано живой проверкой ссылки из уведомления: параметр запуска в
    // адресе был, а остального окружения не было, и приложение упало
    // ещё до входа._ Правильное поведение здесь — работать как обычный
    // сайт: без полноэкранного режима и родных отступов, но работать.
    let cleanup: (() => void) | undefined;
    try {
      cleanup = init();

      // Класс ставится сразу и синхронно: `isTMA()` уже ответил, ждать
      // нечего. Через него стили узнают, что отступы придётся считать
      // самим — Telegram отдаёт и высоту часов, и высоту своих кнопок
      // нулём (см. `globals.css`).
      document.documentElement.classList.add('tg');

      mountMiniApp();
      miniAppReady();
      expandViewport();
    } catch {
      document.documentElement.classList.remove('tg');
      cleanup?.();
      return undefined;
    }

    let unbindCssVars: (() => void) | undefined;
    let unsubFullscreen: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        if (mountViewport.isAvailable()) {
          await mountViewport();
        }
      } catch {
        // Не смонтировался — дальше просто нечего настраивать.
      }
      // Экран мог смениться, пока ждали монтирования.
      if (cancelled) return;

      if (bindViewportCssVars.isAvailable()) {
        unbindCssVars = bindViewportCssVars();
      }

      // Слежение за режимом ставится ДО запроса, а не после.
      //
      // Живой баг: запрос падает, если приложение уже открыто на весь экран
      // (в BotFather выставлен режим запуска Fullscreen). Исключение
      // перехватывалось, и до установки класса дело не доходило — а без
      // класса не работали ни отступ под кнопки Telegram, ни таймер в их
      // полосе. Класс здесь не украшение: Telegram сообщает высоту своих
      // кнопок нулём, и без него считать её неоткуда (см. `globals.css`).
      const syncFullscreenClass = () => {
        document.documentElement.classList.toggle('tg-fullscreen', isFullscreen());
      };
      syncFullscreenClass();
      unsubFullscreen = isFullscreen.sub(syncFullscreenClass);

      // Вертикальный свайп по умолчанию сворачивает мини-приложение. В
      // партии это чистая потеря: смахнул рукой по экрану — и раунд
      // свёрнут. Своих вертикальных жестов у приложения нет, так что
      // отключение ничего не отнимает.
      try {
        if (mountSwipeBehavior.isAvailable()) {
          mountSwipeBehavior();
        }
        disableVerticalSwipes.ifAvailable();
      } catch {
        // На старых клиентах такого управления нет — там сворачивание
        // остаётся, и это не повод ронять приложение.
      }

      try {
        await requestFullscreen.ifAvailable();
      } catch {
        // Отказ в полноэкранном режиме не повод ронять приложение: оно
        // остаётся работоспособным в обычном, просто с шапкой Telegram.
        // Сюда же попадает «уже полноэкранный» — ровно тот случай, ради
        // которого слежение выше стоит раньше запроса.
      }
    })();

    return () => {
      cancelled = true;
      unsubFullscreen?.();
      unbindCssVars?.();
      document.documentElement.classList.remove('tg', 'tg-fullscreen');
      cleanup?.();
    };
  }, []);

  return <>{children}</>;
}
