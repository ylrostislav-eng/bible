/**
 * Повторяемый «случай» от ключа броска.
 *
 * Именно повторяемый: разброс костей, углы кувырка и волокна дерева
 * должны быть одинаковыми при каждой перерисовке. `Math.random` заставил
 * бы кости прыгать на новые места при любом обновлении состояния — этим
 * уже обжигались на плоском столе (см. `docs/checklist.md`).
 */
export function hashRandom(key: string, index: number, salt: number): number {
  let hash = (salt * 2654435761) >>> 0;
  const source = `${key}:${index}`;
  for (let i = 0; i < source.length; i++) {
    hash = Math.imul(hash ^ source.charCodeAt(i), 16777619) >>> 0;
  }
  return ((hash >>> 8) % 100000) / 100000;
}

/** Генератор для процедурных текстур: одна и та же доска на всех запусках. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
