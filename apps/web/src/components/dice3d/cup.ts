import * as THREE from 'three';

/**
 * Кожаный кубок для броска костей.
 *
 * Кубок — не украшение, а то, ради чего игру открывают второй раз.
 * «Бросить» без него — это смена шести цифр на экране, и броска в этом
 * нет. Поэтому у него полная последовательность: кубок поднимается,
 * трясётся, наклоняется, высыпает кости и возвращается на стол.
 *
 * Начало координат кубка — донышко на столе, ось `+Y` — от донышка к
 * горлу. Наклон для высыпания — поворот всей группы вокруг `X`.
 */

export interface Cup {
  group: THREE.Group;
  dispose(): void;
}

export const CUP_HEIGHT = 0.115;

export function buildCup(shadows: boolean): Cup {
  const group = new THREE.Group();
  const trash: Array<{ dispose(): void }> = [];
  const keep = <T extends { dispose(): void }>(item: T): T => {
    trash.push(item);
    return item;
  };

  const leather = keep(
    new THREE.MeshStandardMaterial({
      color: 0x6f4a2a,
      roughness: 0.72,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }),
  );
  const brass = keep(
    new THREE.MeshStandardMaterial({ color: 0xc79a5c, roughness: 0.36, metalness: 0.75 }),
  );

  // Профиль: книзу уже, кверху шире, с лёгким перехватом посередине.
  const profile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.036, 0.0),
    new THREE.Vector2(0.0345, 0.03),
    new THREE.Vector2(0.0375, 0.062),
    new THREE.Vector2(0.045, CUP_HEIGHT),
  ];
  const body = new THREE.Mesh(keep(new THREE.LatheGeometry(profile, 22)), leather);
  body.castShadow = shadows;
  group.add(body);

  const rim = new THREE.Mesh(keep(new THREE.TorusGeometry(0.045, 0.004, 6, 22)), brass);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = CUP_HEIGHT;
  group.add(rim);

  return {
    group,
    dispose() {
      for (const item of trash) item.dispose();
    },
  };
}
