'use client';

import type { DiceValue } from '@bible-arena/shared';
import clsx from 'clsx';

/**
 * Одна игральная кость.
 *
 * Не квадрат с цифрой: точки, скруглённые грани, наклон и тень. Кость —
 * главный предмет на этом столе, и из неё видно, сделана игра или
 * набросана. Рисуется вёрсткой, а не картинкой: их шесть на экране, у
 * каждой свой угол и своё состояние, и шесть загруженных файлов ради
 * этого — лишний вес и мигание при первом броске.
 *
 * Псевдо-объём, а не настоящий 3D: на слабом телефоне внутри Telegram
 * честная физика съедает кадры, а разница видна только если специально
 * приглядываться. Плавность важнее реалистичности — так и записано в
 * задании.
 */

/** Расположение точек на грани, в клетках сетки 3×3. */
const PIPS: Record<DiceValue, Array<[number, number]>> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  5: [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  6: [
    [0, 0],
    [0, 1],
    [0, 2],
    [2, 0],
    [2, 1],
    [2, 2],
  ],
};

export function Die({
  value,
  size = 56,
  /** Кость лежит в отложенных: зачтена и в бросок больше не идёт. */
  held = false,
  /** Выбрана прямо сейчас — до подтверждения. */
  selected = false,
  /** Даёт очки в этом броске: подсказка, а не выбор за игрока. */
  scoring = false,
  /** Небольшой наклон, чтобы кости не стояли по линейке. */
  tilt = 0,
  onClick,
  disabled,
}: {
  value: DiceValue;
  size?: number;
  held?: boolean;
  selected?: boolean;
  scoring?: boolean;
  tilt?: number;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const interactive = Boolean(onClick) && !disabled;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      aria-label={`Кость ${value}${selected ? ', выбрана' : ''}`}
      aria-pressed={selected}
      className={clsx(
        'relative shrink-0 rounded-[22%] transition-transform duration-200',
        interactive ? 'cursor-pointer active:scale-95' : 'cursor-default',
        // Выбранная приподнимается — то же движение, что рукой над столом.
        selected && '-translate-y-2',
      )}
      style={{
        width: size,
        height: size,
        transform: `rotate(${tilt}deg)${selected ? ' translateY(-8px)' : ''}`,
      }}
    >
      <span
        className={clsx(
          'absolute inset-0 rounded-[22%] border transition-colors',
          held
            ? 'border-white/10 bg-gradient-to-br from-[#d8cbb4] to-[#a2937b]'
            : 'border-white/20 bg-gradient-to-br from-[#f4ece0] to-[#c9bda6]',
          selected && 'ring-2 ring-primary',
          // Подсказка «эта кость чего-то стоит».
          //
          // Сначала было только мягкое свечение — на белой кости поверх
          // светлого дерева его почти не видно, и подсказка не работала
          // вовсе. _Нашлось живой проверкой, глазами по снимку._ Теперь
          // ещё и тёплая обводка: она заметна, но от кольца выбора
          // отличается и цветом, и толщиной.
          scoring && !selected && 'ring-2 ring-amber-300/80 shadow-[0_0_14px_rgba(255,190,90,0.7)]',
        )}
        style={{
          boxShadow: selected
            ? '0 10px 18px rgba(0,0,0,0.45)'
            : '0 4px 10px rgba(0,0,0,0.35), inset 0 -2px 4px rgba(0,0,0,0.18), inset 0 2px 3px rgba(255,255,255,0.55)',
        }}
      />
      <span className="absolute inset-[14%] grid grid-cols-3 grid-rows-3">
        {PIPS[value].map(([row, col]) => (
          <span
            key={`${row}-${col}`}
            className="rounded-full bg-[#2a2018]"
            style={{
              gridRow: row + 1,
              gridColumn: col + 1,
              width: '78%',
              height: '78%',
              alignSelf: 'center',
              justifySelf: 'center',
              boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.6)',
            }}
          />
        ))}
      </span>
    </button>
  );
}
