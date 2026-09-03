'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Полноэкранный режим: приложение убирает собственный хром — нижнюю
 * навигацию, плавающие кнопки чата и приглашений, всплывающие уведомления.
 *
 * Нужен там, где экран целиком принадлежит происходящему и любой чужой
 * элемент не просто мешает, а физически перекрывает нужную кнопку: партия
 * Alias идёт вокруг одного телефона, в руках у человека, который смотрит на
 * слово и жмёт «угадали» вслепую. Всплывшее в этот момент «вас вызвали на
 * дуэль» — это сорванный раунд.
 */
interface ImmersiveContextValue {
  immersive: boolean;
  setImmersive: (value: boolean) => void;
}

const ImmersiveContext = createContext<ImmersiveContextValue | null>(null);

export function ImmersiveProvider({ children }: { children: React.ReactNode }) {
  const [immersive, setImmersive] = useState(false);
  const value = useMemo(() => ({ immersive, setImmersive }), [immersive]);
  return <ImmersiveContext.Provider value={value}>{children}</ImmersiveContext.Provider>;
}

export function useImmersive(): ImmersiveContextValue {
  const context = useContext(ImmersiveContext);
  if (!context) throw new Error('useImmersive вне ImmersiveProvider');
  return context;
}

/**
 * Держит полноэкранный режим включённым, пока условие истинно, и обязательно
 * снимает его при уходе с экрана — иначе приложение осталось бы без навигации
 * после выхода из игры, и вернуться было бы некуда.
 */
export function useImmersiveWhile(active: boolean): void {
  const { setImmersive } = useImmersive();

  useEffect(() => {
    setImmersive(active);
    return () => setImmersive(false);
  }, [active, setImmersive]);
}
