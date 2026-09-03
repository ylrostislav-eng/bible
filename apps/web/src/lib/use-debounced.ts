'use client';

import { useEffect, useState } from 'react';

/**
 * Значение с задержкой. Нужно там, где элемент управления меняется быстрее,
 * чем успевает вернуться ответ сервера: без задержки на каждое нажатие
 * уходит запрос, и на экране оседает ответ от позапрошлого состояния — то
 * есть просто неверное число.
 */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
