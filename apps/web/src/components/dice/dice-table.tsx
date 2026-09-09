'use client';

import type { DiceValue } from '@bible-arena/shared';
import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Die } from './die';

/**
 * Игровой стол: дерево, бортики, кружка и кости.
 *
 * Кружка — не украшение, а то, ради чего игру открывают второй раз.
 * Нажатие «Бросить» без неё — это смена шести цифр, и никакого броска в
 * этом нет. Поэтому здесь целая последовательность: кружка поднимается,
 * трясётся, наклоняется, кости высыпаются и раскатываются.
 *
 * Анимация процедурная, без физического движка: углы и смещения
 * считаются один раз на бросок и дальше живут в CSS-переходах. Честная
 * физика на слабом телефоне внутри Telegram съедает кадры, а разница
 * видна, только если специально приглядываться.
 *
 * Важно: **выпавшее уже известно** к началу анимации — его прислал
 * сервер. Здесь не разыгрывается результат, здесь он показывается.
 */

/** Сколько длится каждый шаг броска. Суммарно чуть больше секунды: дольше
 * — и на десятом броске за партию это начнёт раздражать. */
const SHAKE_MS = 520;
const POUR_MS = 260;
const SETTLE_MS = 420;
export const DICE_THROW_MS = SHAKE_MS + POUR_MS + SETTLE_MS;

type Stage = 'idle' | 'shaking' | 'pouring' | 'settled';

export function DiceTable({
  dice,
  selected,
  scoringHint,
  onToggle,
  disabled,
  /** Меняется на каждый новый бросок — по нему запускается анимация. */
  rollKey,
  children,
}: {
  dice: DiceValue[];
  selected: number[];
  /** Индексы костей, которые дают очки: подсветка, а не выбор. */
  scoringHint: number[];
  onToggle?: (index: number) => void;
  disabled?: boolean;
  rollKey: string;
  /** Отложенные кости и прочее, что рисуется под столом. */
  children?: React.ReactNode;
}) {
  const [stage, setStage] = useState<Stage>(dice.length ? 'settled' : 'idle');
  const previousKey = useRef(rollKey);

  useEffect(() => {
    if (previousKey.current === rollKey) return;
    previousKey.current = rollKey;
    // Все переходы — через таймеры, включая мгновенный: React Compiler не
    // разрешает менять состояние прямо в теле эффекта, и «всего одна
    // синхронная ветка» ловится линтером так же, как остальные (см.
    // чеклист).
    if (dice.length === 0) {
      const toIdle = setTimeout(() => setStage('idle'), 0);
      return () => clearTimeout(toIdle);
    }
    const toShake = setTimeout(() => setStage('shaking'), 0);
    const toPour = setTimeout(() => setStage('pouring'), SHAKE_MS);
    const toSettle = setTimeout(() => setStage('settled'), SHAKE_MS + POUR_MS);
    return () => {
      clearTimeout(toShake);
      clearTimeout(toPour);
      clearTimeout(toSettle);
    };
  }, [rollKey, dice.length]);

  // Углы и разброс — свои на каждый бросок, иначе кости ложатся по
  // линейке и стол выглядит таблицей, а не столом.
  const scatter = useMemo(
    () =>
      dice.map((_, index) => ({
        tilt: pseudoRandom(rollKey, index, 1) * 36 - 18,
        dx: pseudoRandom(rollKey, index, 2) * 10 - 5,
        dy: pseudoRandom(rollKey, index, 3) * 8 - 4,
        delay: index * 55,
      })),
    [dice, rollKey],
  );

  return (
    <div className="relative">
      {/* Столешница: тёмное дерево с бортиком. Полоски — не текстура из
          файла, а градиент: файл ради фона стола весил бы больше всей
          страницы. */}
      <div
        className="relative overflow-hidden rounded-3xl border-[6px] border-[#3b2a1c] p-4 shadow-[inset_0_2px_18px_rgba(0,0,0,0.55)]"
        style={{
          background:
            'repeating-linear-gradient(96deg, #4a3524 0px 14px, #513a27 14px 28px), radial-gradient(120% 90% at 50% 0%, #6b4d33 0%, #3d2a1b 100%)',
          backgroundBlendMode: 'multiply',
          minHeight: 190,
        }}
      >
        {/* Тёплый свет сверху — свеча над столом, а не лампа дневного
            света. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(70% 55% at 50% 12%, rgba(255,206,130,0.22) 0%, rgba(0,0,0,0) 70%)',
          }}
        />

        <Cup stage={stage} />

        <div
          className={clsx(
            'relative flex min-h-[120px] flex-wrap items-center justify-center gap-2 transition-opacity',
            stage === 'shaking' ? 'opacity-0' : 'opacity-100',
          )}
        >
          {dice.length === 0 ? (
            <p className="text-sm text-[#d8c6a6]/70">Кружка ждёт броска</p>
          ) : (
            dice.map((value, index) => {
              const isSelected = selected.includes(index);
              return (
                <span
                  key={`${rollKey}-${index}`}
                  className="transition-transform"
                  style={{
                    transform:
                      stage === 'pouring'
                        ? 'translateY(-26px) scale(0.9)'
                        : `translate(${scatter[index]?.dx ?? 0}px, ${scatter[index]?.dy ?? 0}px)`,
                    transitionDuration: `${SETTLE_MS}ms`,
                    transitionDelay: `${stage === 'settled' ? (scatter[index]?.delay ?? 0) : 0}ms`,
                  }}
                >
                  <Die
                    value={value}
                    tilt={scatter[index]?.tilt ?? 0}
                    selected={isSelected}
                    scoring={scoringHint.includes(index)}
                    disabled={disabled || stage !== 'settled'}
                    onClick={onToggle ? () => onToggle(index) : undefined}
                  />
                </span>
              );
            })
          )}
        </div>
      </div>

      {children}
    </div>
  );
}

/** Кружка: поднимается, трясётся, наклоняется — и уходит с глаз. */
function Cup({ stage }: { stage: Stage }) {
  const visible = stage === 'shaking' || stage === 'pouring';
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 transition-all"
      style={{
        opacity: visible ? 1 : 0,
        transitionDuration: '220ms',
        transform: `translateX(-50%) ${
          stage === 'shaking'
            ? 'translateY(0) rotate(0deg)'
            : stage === 'pouring'
              ? 'translateY(10px) rotate(112deg)'
              : 'translateY(-24px)'
        }`,
      }}
    >
      <div className={clsx(stage === 'shaking' && 'dice-cup-shake')}>
        <svg width="74" height="86" viewBox="0 0 74 86" aria-hidden>
          <defs>
            <linearGradient id="dice-cup-body" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#6b4a2c" />
              <stop offset="45%" stopColor="#a9793f" />
              <stop offset="100%" stopColor="#5a3d24" />
            </linearGradient>
          </defs>
          {/* Кожаная кружка: книзу уже, с потёртым ободом. */}
          <path
            d="M14 12 L60 12 L52 78 Q37 84 22 78 Z"
            fill="url(#dice-cup-body)"
            stroke="#2f2015"
            strokeWidth="2"
          />
          <ellipse cx="37" cy="12" rx="23" ry="7" fill="#2a1c12" />
          <ellipse cx="37" cy="12" rx="23" ry="7" fill="none" stroke="#c79a5c" strokeWidth="2" />
          <path
            d="M17 34 Q37 40 57 34"
            fill="none"
            stroke="#3a2817"
            strokeWidth="2"
            opacity="0.6"
          />
        </svg>
      </div>
    </div>
  );
}

/**
 * Повторяемый «случай» от ключа броска.
 *
 * Именно повторяемый: при перерисовке кости не должны прыгать на новые
 * места, иначе стол дрожит на каждом обновлении состояния. `Math.random`
 * здесь дал бы ровно это.
 */
function pseudoRandom(key: string, index: number, salt: number): number {
  let hash = salt * 2654435761;
  const source = `${key}:${index}`;
  for (let i = 0; i < source.length; i++) {
    hash = (hash ^ source.charCodeAt(i)) * 16777619;
    hash >>>= 0;
  }
  return (hash % 1000) / 1000;
}
