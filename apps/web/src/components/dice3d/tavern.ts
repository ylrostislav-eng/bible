import * as THREE from 'three';
import { BOARD, CANDLE, RIVAL, TABLE } from './layout';
import { feltTexture, wallTexture, woodTexture } from './textures';

/**
 * Таверна вокруг стола: столешница, доска, свеча, стена и соперник.
 *
 * Всё, кроме костей и кубка, строится один раз и больше не меняется —
 * поэтому и вынесено отдельно от сцены. Ни одной загруженной модели:
 * фигура собрана из примитивов. Для первой версии нужна не студийная
 * анимация, а постановка кадра — чтобы игрок видел, что сидит **за
 * столом напротив живого человека**, а не смотрит на доску сверху.
 */

export interface Tavern {
  root: THREE.Group;
  /** Огонёк свечи: мерцает в общем цикле отрисовки. */
  candleLight: THREE.PointLight;
  flame: THREE.Mesh;
  /** Соперник целиком — качается при дыхании и наклоняется на своём ходу. */
  rival: THREE.Group;
  rivalArms: THREE.Group;
  dispose(): void;
}

export function buildTavern(shadows: boolean): Tavern {
  const root = new THREE.Group();
  const trash: Array<{ dispose(): void }> = [];
  const keep = <T extends { dispose(): void }>(item: T): T => {
    trash.push(item);
    return item;
  };

  const wood = keep(woodTexture());
  const felt = keep(feltTexture());
  const wall = keep(wallTexture());

  const tableMaterial = keep(
    new THREE.MeshStandardMaterial({ map: wood, roughness: 0.78, metalness: 0.04 }),
  );
  const rimMaterial = keep(
    new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.65, metalness: 0.06 }),
  );
  const feltMaterial = keep(new THREE.MeshStandardMaterial({ map: felt, roughness: 0.96 }));

  // Столешница. Толстая: тонкая доска в перспективе выглядит фанерой.
  const table = new THREE.Mesh(
    keep(new THREE.BoxGeometry(TABLE.width, TABLE.thickness, TABLE.depth)),
    tableMaterial,
  );
  table.position.y = -TABLE.thickness / 2;
  table.receiveShadow = shadows;
  root.add(table);

  // Доска: дно из сукна и четыре бортика. Бортики — не украшение: об них
  // кости отскакивают, и без них бросок улетает «в никуда».
  const board = new THREE.Group();
  board.position.copy(BOARD.centre);
  const floor = new THREE.Mesh(
    keep(new THREE.BoxGeometry(BOARD.halfX * 2, BOARD.floorTop, BOARD.halfZ * 2)),
    feltMaterial,
  );
  floor.position.y = BOARD.floorTop / 2;
  floor.receiveShadow = shadows;
  board.add(floor);

  const rimLong = keep(
    new THREE.BoxGeometry(
      BOARD.halfX * 2 + BOARD.rimThickness * 2,
      BOARD.rimHeight,
      BOARD.rimThickness,
    ),
  );
  const rimShort = keep(
    new THREE.BoxGeometry(BOARD.rimThickness, BOARD.rimHeight, BOARD.halfZ * 2),
  );
  for (const z of [-BOARD.halfZ - BOARD.rimThickness / 2, BOARD.halfZ + BOARD.rimThickness / 2]) {
    const rim = new THREE.Mesh(rimLong, rimMaterial);
    rim.position.set(0, BOARD.rimHeight / 2, z);
    rim.castShadow = shadows;
    rim.receiveShadow = shadows;
    board.add(rim);
  }
  for (const x of [-BOARD.halfX - BOARD.rimThickness / 2, BOARD.halfX + BOARD.rimThickness / 2]) {
    const rim = new THREE.Mesh(rimShort, rimMaterial);
    rim.position.set(x, BOARD.rimHeight / 2, 0);
    rim.castShadow = shadows;
    rim.receiveShadow = shadows;
    board.add(rim);
  }
  root.add(board);

  // Стена позади соперника. Без неё фигура висит в пустоте, и глубины в
  // кадре нет вовсе.
  const wallMesh = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(3.4, 2.4)),
    keep(new THREE.MeshStandardMaterial({ map: wall, roughness: 1 })),
  );
  wallMesh.position.set(0, 0.5, -1.25);
  root.add(wallMesh);

  // Свеча: единственный тёплый источник в кадре.
  const candle = new THREE.Group();
  candle.position.copy(CANDLE);
  const stick = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(0.016, 0.019, 0.11, 10)),
    keep(new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.6 })),
  );
  stick.position.y = 0.055;
  stick.castShadow = shadows;
  candle.add(stick);
  const flame = new THREE.Mesh(
    keep(new THREE.ConeGeometry(0.009, 0.032, 8)),
    keep(new THREE.MeshBasicMaterial({ color: 0xffcf7a, transparent: true, opacity: 0.95 })),
  );
  flame.position.y = 0.126;
  candle.add(flame);
  root.add(candle);

  const candleLight = new THREE.PointLight(0xffb163, 2.2, 2.4, 2);
  candleLight.position.set(CANDLE.x, 0.14, CANDLE.z);
  root.add(candleLight);

  const { group: rival, arms: rivalArms } = buildRival(shadows, keep);
  root.add(rival);

  return {
    root,
    candleLight,
    flame,
    rival,
    rivalArms,
    dispose() {
      for (const item of trash) item.dispose();
    },
  };
}

/**
 * Соперник: фигура в капюшоне, сидящая напротив.
 *
 * Намеренно стилизованная и без лица. Лицо на низкополигональной модели
 * без нормальной анимации мимики выглядит мёртвым — «зловещая долина»
 * получается ровно из попытки сделать похоже. Силуэт в капюшоне, тёплый
 * контровой свет и живое дыхание читаются как человек и не обещают
 * того, чего нет.
 */
function buildRival(
  shadows: boolean,
  keep: <T extends { dispose(): void }>(item: T) => T,
): { group: THREE.Group; arms: THREE.Group } {
  const group = new THREE.Group();
  group.position.set(0, 0, RIVAL.z);

  const cloth = keep(
    new THREE.MeshStandardMaterial({ color: 0x2f2a26, roughness: 0.95, metalness: 0 }),
  );
  const skin = keep(new THREE.MeshStandardMaterial({ color: 0x8d6b52, roughness: 0.8 }));
  const hoodCloth = keep(new THREE.MeshStandardMaterial({ color: 0x3d3129, roughness: 0.95 }));

  // Плечи уже, чем просятся «по-настоящему»: в узком кадре телефона
  // широкая фигура становится стеной на весь экран и закрывает и стену,
  // и свечу, и глубину.
  const torso = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(0.125, 0.185, 0.46, 14, 1, true)),
    cloth,
  );
  torso.material.side = THREE.DoubleSide;
  torso.position.y = 0.13;
  torso.castShadow = shadows;
  group.add(torso);

  const shoulders = new THREE.Mesh(keep(new THREE.SphereGeometry(0.13, 16, 12)), cloth);
  shoulders.scale.set(1.25, 0.62, 0.85);
  shoulders.position.y = 0.32;
  shoulders.castShadow = shadows;
  group.add(shoulders);

  const neck = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.032, 0.042, 0.06, 10)), skin);
  neck.position.y = 0.36;
  group.add(neck);

  const head = new THREE.Mesh(keep(new THREE.SphereGeometry(0.058, 18, 14)), skin);
  head.scale.set(1, 1.12, 0.95);
  head.position.y = RIVAL.headY;
  head.castShadow = shadows;
  group.add(head);

  // Капюшон: полусфера чуть больше головы, открытая к игроку.
  const hood = new THREE.Mesh(
    keep(new THREE.SphereGeometry(0.078, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62)),
    hoodCloth,
  );
  hood.material.side = THREE.DoubleSide;
  hood.position.set(0, RIVAL.headY + 0.012, -0.012);
  hood.rotation.x = -0.22;
  hood.castShadow = shadows;
  group.add(hood);

  // Руки на столе: предплечья от плеч к кистям у доски. Именно они
  // делают сидящего сидящим за столом, а не стоящим за ним.
  const arms = new THREE.Group();
  const forearm = keep(new THREE.CapsuleGeometry(0.036, 0.2, 4, 10));
  const hand = keep(new THREE.SphereGeometry(0.042, 12, 10));
  for (const side of [-1, 1]) {
    const limb = new THREE.Mesh(forearm, cloth);
    limb.position.set(side * 0.16, 0.11, 0.14);
    limb.rotation.set(1.15, 0, side * 0.28);
    limb.castShadow = shadows;
    arms.add(limb);

    const palm = new THREE.Mesh(hand, skin);
    palm.scale.set(1, 0.62, 1.25);
    palm.position.set(side * 0.19, 0.028, 0.25);
    palm.castShadow = shadows;
    arms.add(palm);
  }
  group.add(arms);

  return { group, arms };
}
