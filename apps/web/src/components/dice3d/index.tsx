'use client';

import dynamic from 'next/dynamic';
import type { DiceSceneProps } from './dice-scene';

/**
 * Точка входа в трёхмерный стол.
 *
 * `ssr: false` обязателен: сцена строит текстуры на `canvas` и трогает
 * `window` ещё в конструкторе, на сервере этого нет. Заодно three не
 * попадает в общий клиентский пакет — его тянут только те, кто открыл
 * «Кости», а не каждый, кто зашёл на главную.
 */
const DiceSceneView = dynamic(() => import('./dice-scene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center rounded-3xl bg-[#150e08] text-sm text-[#d8c6a6]/60">
      Зажигаем свечу…
    </div>
  ),
});

export function DiceTable3D(props: DiceSceneProps) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-3xl bg-[#0d0906]">
      <DiceSceneView {...props} />
      {/* Стол — картинка, и для чтения с экрана он нем. Значения костей
          дублируются текстом: без этого игра просто недоступна. */}
      <p className="sr-only" aria-live="polite">
        {props.dice.length === 0
          ? 'Кубок ждёт броска'
          : `На столе: ${props.dice
              .map((value, index) => {
                const state = props.locked.includes(index)
                  ? ' (отложена)'
                  : props.picked.includes(index)
                    ? ' (выбрана)'
                    : '';
                return `${value}${state}`;
              })
              .join(', ')}`}
      </p>
    </div>
  );
}

export type { DiceSceneProps };
export type { OpponentAppearance } from './tavern';
export { DICE_ROLL_MS } from './scene';
