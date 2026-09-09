import { randomInt } from 'node:crypto';
import type { DiceValue } from '@bible-arena/shared';

/**
 * Бросок костей.
 *
 * `randomInt` из `node:crypto`, а не `Math.random()`, и это не
 * перестраховка. `Math.random` в V8 — предсказуемый генератор: по
 * достаточному числу выданных значений его состояние восстанавливается, и
 * дальше бросок можно вычислить наперёд. В игре, где решение «рискнуть
 * или забрать» — это вся игра, знание следующего броска означает, что
 * игры нет.
 *
 * Заодно `randomInt` не косит: он отбрасывает значения, попавшие в
 * неполный остаток диапазона, вместо `% 6`, которое делает единицы и
 * двойки чуть вероятнее шестёрок.
 */
export function rollDice(count: number): DiceValue[] {
  return Array.from({ length: count }, () => randomInt(1, 7) as DiceValue);
}
