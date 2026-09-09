import * as THREE from 'three';

/**
 * Кожаный кубок и рука, которая его держит.
 *
 * Кубок — не украшение, а то, ради чего игру открывают второй раз.
 * «Бросить» без него — это смена шести цифр на экране, и броска в этом
 * нет. Поэтому у него полная последовательность: рука тянется, берёт,
 * поднимает, трясёт, наклоняет, высыпает и ставит обратно.
 *
 * Начало координат кубка — донышко на столе, ось `+Y` — от донышка к
 * горлу. Наклон для высыпания — поворот всей группы вокруг `X`, и рука
 * едет вместе с ней, потому что она в той же группе.
 */

export interface Cup {
  group: THREE.Group;
  /** Рука видна только со стороны игрока: свою руку он видит, чужую — нет. */
  hand: THREE.Group;
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

  const hand = buildHand(shadows, keep);
  group.add(hand);

  return {
    group,
    hand,
    dispose() {
      for (const item of trash) item.dispose();
    },
  };
}

/**
 * Рука игрока: предплечье снизу кадра и пальцы на кубке.
 *
 * Пальцы — четыре капсулы, а не смоделированная кисть: на кубке
 * шириной девять сантиметров, который к тому же почти всё время в
 * движении, разница не видна, а стоит она модели, скелета и весов.
 */
function buildHand(
  shadows: boolean,
  keep: <T extends { dispose(): void }>(item: T) => T,
): THREE.Group {
  const hand = new THREE.Group();
  const skin = keep(new THREE.MeshStandardMaterial({ color: 0xa97a58, roughness: 0.82 }));
  const sleeve = keep(new THREE.MeshStandardMaterial({ color: 0x574434, roughness: 0.95 }));

  const forearm = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.042, 0.26, 4, 12)), sleeve);
  forearm.position.set(0.03, -0.09, 0.15);
  forearm.rotation.set(-0.95, 0, -0.18);
  forearm.castShadow = shadows;
  hand.add(forearm);

  const palm = new THREE.Mesh(keep(new THREE.SphereGeometry(0.05, 14, 12)), skin);
  palm.scale.set(0.9, 0.78, 0.62);
  palm.position.set(0.012, 0.05, 0.05);
  palm.castShadow = shadows;
  hand.add(palm);

  const finger = keep(new THREE.CapsuleGeometry(0.011, 0.05, 3, 8));
  for (let i = 0; i < 4; i++) {
    const digit = new THREE.Mesh(finger, skin);
    const angle = -0.5 + i * 0.42;
    digit.position.set(Math.sin(angle) * -0.049, 0.052 + i * 0.016, Math.cos(angle) * 0.049);
    digit.rotation.set(Math.PI / 2, 0, angle);
    hand.add(digit);
  }

  const thumb = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.013, 0.045, 3, 8)), skin);
  thumb.position.set(0.046, 0.038, 0.014);
  thumb.rotation.set(0.4, 0, -1.15);
  hand.add(thumb);

  return hand;
}
