import type { DiceValue } from '@bible-arena/shared';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Настоящая кость: скруглённый куб с шестью гранями и точками.
 *
 * Не карточка с нарисованными точками и не куб с текстурой. Проверяется
 * это на силуэте: при кувырке в воздухе видно ребро, и картинка на
 * плоскости себя тут же выдаёт.
 *
 * **Точки — отдельные тёмные полусферы, а не выемки.** Настоящее
 * углубление в скруглённом кубе требует булевой операции над геометрией
 * (CSG): это отдельная библиотека, шесть тяжёлых мешей вместо двух
 * общих и заметная пауза на первом кадре. Полусфера, наполовину
 * утопленная в грань, на кости в три сантиметра читается так же, а
 * стоит один общий буфер на все шесть костей.
 *
 * Раскладка граней постоянная и такая же, как у настоящей кости —
 * противоположные в сумме дают семь:
 * `+Y = 1`, `−Y = 6`, `+X = 2`, `−X = 5`, `+Z = 3`, `−Z = 4`.
 */

export const DIE_SIZE = 0.032;

/** Расположение точек на грани, в клетках сетки 3×3. Та же таблица, что
 * была у плоской кости: раскладка точек — не место для творчества. */
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

/** Грань: её нормаль и две оси, вдоль которых раскладывается сетка 3×3. */
const FACES: Array<{
  value: DiceValue;
  normal: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
}> = [
  {
    value: 1,
    normal: new THREE.Vector3(0, 1, 0),
    u: new THREE.Vector3(1, 0, 0),
    v: new THREE.Vector3(0, 0, 1),
  },
  {
    value: 6,
    normal: new THREE.Vector3(0, -1, 0),
    u: new THREE.Vector3(1, 0, 0),
    v: new THREE.Vector3(0, 0, 1),
  },
  {
    value: 2,
    normal: new THREE.Vector3(1, 0, 0),
    u: new THREE.Vector3(0, 1, 0),
    v: new THREE.Vector3(0, 0, 1),
  },
  {
    value: 5,
    normal: new THREE.Vector3(-1, 0, 0),
    u: new THREE.Vector3(0, 1, 0),
    v: new THREE.Vector3(0, 0, 1),
  },
  {
    value: 3,
    normal: new THREE.Vector3(0, 0, 1),
    u: new THREE.Vector3(1, 0, 0),
    v: new THREE.Vector3(0, 1, 0),
  },
  {
    value: 4,
    normal: new THREE.Vector3(0, 0, -1),
    u: new THREE.Vector3(1, 0, 0),
    v: new THREE.Vector3(0, 1, 0),
  },
];

/** Костяное тело со скруглёнными рёбрами. Один буфер на все кости. */
export function createDieBodyGeometry(segments: number): THREE.BufferGeometry {
  return new RoundedBoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE, segments, DIE_SIZE * 0.14);
}

/** Все двадцать одна точка одним буфером: 12 вызовов отрисовки на шесть
 * костей вместо ста тридцати. */
export function createDiePipsGeometry(segments: number): THREE.BufferGeometry {
  const radius = DIE_SIZE * 0.088;
  const step = DIE_SIZE * 0.26;
  const half = DIE_SIZE / 2;
  const parts: THREE.BufferGeometry[] = [];

  for (const face of FACES) {
    for (const [row, col] of PIPS[face.value]) {
      const dome = new THREE.SphereGeometry(radius, segments * 2, segments);
      // Приплюснута по нормали: получается неглубокая лунка, а не шарик,
      // приклеенный к грани.
      dome.scale(1, 0.45, 1);
      // Сфера строится «полюсами по Y» — доворачиваем её к нормали грани.
      const align = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        face.normal,
      );
      dome.applyQuaternion(align);
      const centre = face.normal
        .clone()
        .multiplyScalar(half - radius * 0.12)
        .addScaledVector(face.u, (col - 1) * step)
        .addScaledVector(face.v, (row - 1) * step);
      dome.translate(centre.x, centre.y, centre.z);
      parts.push(dome);
    }
  }

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('Не удалось собрать точки кости');
  return merged;
}

/**
 * Поворот, при котором нужное число смотрит вверх.
 *
 * Значение кости приходит **с сервера до анимации**, поэтому падение не
 * разыгрывается физикой, а приводится к этому повороту: честная физика
 * не умеет гарантировать заранее известную грань, а бросать на клиенте
 * нельзя — сервер авторитетен (см. `docs/dice.md`).
 */
export function faceUpQuaternion(value: DiceValue, yaw: number): THREE.Quaternion {
  const face = new THREE.Quaternion();
  switch (value) {
    case 1:
      break;
    case 6:
      face.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
      break;
    case 2:
      face.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
      break;
    case 5:
      face.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
      break;
    case 3:
      face.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
      break;
    case 4:
      face.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      break;
  }
  // Доворот вокруг вертикали: кости не должны лежать по линейке.
  const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  return spin.multiply(face);
}
