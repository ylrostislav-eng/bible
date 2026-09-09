import type { DiceValue } from '@bible-arena/shared';
import * as THREE from 'three';
import { buildCup, CUP_HEIGHT, type Cup } from './cup';
import { createDieBodyGeometry, createDiePipsGeometry, DIE_SIZE, faceUpQuaternion } from './die';
import { BOARD, CAMERA, CUP_SPOTS, DIE_REST_Y, RIVAL } from './layout';
import { hashRandom } from './rand';
import { buildTavern, type Tavern } from './tavern';

/**
 * Сцена «Костей»: дуэль от первого лица.
 *
 * Слои разделены жёстко: правила живут в `shared`, состояние партии — на
 * сервере, здесь только показ. Сцена ничего не решает и ничего не
 * считает — ей говорят «вот шесть значений, вот выбранное» и она это
 * показывает.
 *
 * **Физики нет, и это не упрощение, а следствие.** Значения костей
 * приходят с сервера ещё до анимации. Честный физический бросок не
 * умеет закончиться заранее известной гранью: пришлось бы либо бросать
 * на клиенте (и сервер перестал бы быть авторитетным — ровно то, от
 * чего защищались на втором этапе), либо всё равно подгонять результат
 * в последний момент. Раз подгонка неизбежна, лучше она честная и
 * дешёвая: кость кувыркается в полёте, а на последней четверти пути
 * доворачивается в нужный поворот. На глаз неотличимо, стоит один
 * `slerp` вместо решателя столкновений.
 *
 * Разброс и углы считаются от ключа броска и **повторяемы**: иначе при
 * каждой перерисовке кости прыгали бы на новые места (этим уже
 * обжигались на плоском столе).
 */

const CUP_LIFT_MS = 140;
const CUP_SHAKE_MS = 360;
const CUP_TILT_MS = 160;
/** Когда кости покидают кубок. */
const RELEASE_MS = CUP_LIFT_MS + CUP_SHAKE_MS + CUP_TILT_MS;
const FLIGHT_MS = 780;
/** Сколько длится бросок целиком. */
export const DICE_ROLL_MS = RELEASE_MS + FLIGHT_MS;
/** Доля полёта, после которой кость перестаёт кувыркаться и доворачивается. */
const AIM_FROM = 0.72;

const MAX_DICE = 6;

export type SceneSide = 'you' | 'rival';
type Quality = 'high' | 'medium' | 'low';

export interface DiceSceneOptions {
  canvas: HTMLCanvasElement;
  reducedMotion: boolean;
  onPick: (index: number) => void;
}

interface DieView {
  group: THREE.Group;
  body: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  index: number;
}

export class DiceScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly tavern: Tavern;
  private readonly cup: Cup;
  private readonly dice: DieView[] = [];
  private readonly keyLight: THREE.DirectionalLight;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly canvas: HTMLCanvasElement;
  private readonly reducedMotion: boolean;
  private readonly onPick: (index: number) => void;
  private readonly geometries: THREE.BufferGeometry[] = [];

  private frame = 0;
  private running = false;
  private startedAt = 0;
  private values: DiceValue[] = [];
  private rollKey = 'none';
  private throwAt = Number.NEGATIVE_INFINITY;
  private side: SceneSide = 'you';
  private picked: number[] = [];
  private locked: number[] = [];
  private hint: number[] = [];
  private interactive = false;
  private rivalThinking = false;

  private quality: Quality = 'high';
  private frames = 0;
  private framesSince = 0;

  constructor({ canvas, reducedMotion, onPick }: DiceSceneOptions) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    this.onPick = onPick;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x0d0906, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Тёплая таверна: без тонального отображения свеча выжигает белым
    // пятном всё, до чего дотягивается.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.camera = new THREE.PerspectiveCamera(CAMERA.maxFov, 1, 0.05, 8);
    this.camera.position.copy(CAMERA.position);
    this.camera.lookAt(CAMERA.target);

    // Туман съедает дальнюю стену — глубина без единого лишнего полигона.
    // Цвет тёплый, а не чёрный: чёрный туман давал над столом ровную
    // дыру, в которой не читалось ни стены, ни расстояния.
    this.scene.fog = new THREE.Fog(0x1d1209, 0.8, 2.2);

    this.tavern = buildTavern(true);
    this.scene.add(this.tavern.root);

    this.cup = buildCup(true);
    this.cup.group.position.copy(CUP_SPOTS.you.rest);
    this.scene.add(this.cup.group);

    this.scene.add(new THREE.HemisphereLight(0x5a3d22, 0x0a0705, 0.55));

    this.keyLight = new THREE.DirectionalLight(0xffd9a8, 1.5);
    this.keyLight.position.set(-0.5, 1.1, 0.35);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 0.2;
    this.keyLight.shadow.camera.far = 2.4;
    this.keyLight.shadow.camera.left = -0.5;
    this.keyLight.shadow.camera.right = 0.5;
    this.keyLight.shadow.camera.top = 0.5;
    this.keyLight.shadow.camera.bottom = -0.5;
    this.keyLight.shadow.bias = -0.0012;
    this.scene.add(this.keyLight);

    // Контровой из-за спины соперника: без него тёмная фигура сливается
    // с тёмной стеной, и напротив игрока оказывается пятно.
    const rim = new THREE.PointLight(0xffa860, 1.9, 2.4, 2);
    rim.position.set(0.42, 0.72, -0.95);
    this.scene.add(rim);

    this.buildDice();

    canvas.addEventListener('pointerdown', this.handlePointer);
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  private buildDice() {
    const bodyGeometry = createDieBodyGeometry(3);
    const pipsGeometry = createDiePipsGeometry(5);
    this.geometries.push(bodyGeometry, pipsGeometry);
    const pipMaterial = new THREE.MeshStandardMaterial({ color: 0x231a12, roughness: 0.55 });

    for (let index = 0; index < MAX_DICE; index++) {
      const group = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({
        color: 0xefe3cd,
        roughness: 0.38,
        metalness: 0.02,
        emissive: 0x000000,
      });
      const body = new THREE.Mesh(bodyGeometry, material);
      body.castShadow = true;
      body.receiveShadow = true;
      body.userData.dieIndex = index;
      const pips = new THREE.Mesh(pipsGeometry, pipMaterial);
      group.add(body, pips);
      group.visible = false;
      this.scene.add(group);
      this.dice.push({ group, body, material, index });
    }
  }

  // ---- внешнее управление -------------------------------------------------

  /** Новые кости на столе. `animate` — играть ли бросок или просто положить. */
  setDice(values: DiceValue[], rollKey: string, animate: boolean) {
    this.values = values.slice(0, MAX_DICE);
    this.rollKey = rollKey;
    this.throwAt = animate && !this.reducedMotion ? this.now() : Number.NEGATIVE_INFINITY;
    for (const die of this.dice) die.group.visible = die.index < this.values.length;
    if (!animate || this.reducedMotion) this.placeAtRest();
  }

  /** `picked` — выбрано и ещё не подтверждено, `locked` — уже отложено. */
  setSelection(picked: number[], locked: number[], hint: number[]) {
    this.picked = picked;
    this.locked = locked;
    this.hint = hint;
  }

  setInteractive(value: boolean) {
    this.interactive = value;
  }

  /** Чей кубок в кадре: свой справа, соперника — на его стороне стола. */
  setSide(side: SceneSide) {
    this.side = side;
    this.cup.hand.visible = side === 'you';
  }

  setRivalThinking(value: boolean) {
    this.rivalThinking = value;
  }

  resize() {
    const width = this.canvas.clientWidth || 1;
    const height = this.canvas.clientHeight || 1;
    this.camera.aspect = width / height;
    // Вертикальный угол считается из горизонтального: см. `CAMERA` в
    // `layout.ts` — иначе узкий телефон превращает сцену в телеобъектив.
    const half = Math.atan(Math.tan((CAMERA.horizontalFov * Math.PI) / 360) / this.camera.aspect);
    this.camera.fov = Math.min(CAMERA.maxFov, Math.max(CAMERA.minFov, (half * 360) / Math.PI));
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(width, height, false);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.startedAt = performance.now();
    this.frames = 0;
    this.framesSince = performance.now();
    this.loop();
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener('pointerdown', this.handlePointer);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.tavern.dispose();
    this.cup.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const die of this.dice) die.material.dispose();
    this.renderer.dispose();
  }

  // ---- внутреннее ---------------------------------------------------------

  private now() {
    return performance.now();
  }

  private pixelRatio() {
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    if (this.quality === 'high') return Math.min(dpr, 2);
    if (this.quality === 'medium') return Math.min(dpr, 1.25);
    return 1;
  }

  /**
   * Падение кадров лечится качеством картинки, а не отказом от 3D.
   *
   * Сначала уходит плотность пикселей, потом тени — то, что дороже всего
   * и заметно меньше всего. Возврата наверх нет намеренно: сцена,
   * прыгающая между уровнями, мигает тенями на каждом броске.
   */
  private watchPerformance(now: number) {
    this.frames++;
    const elapsed = now - this.framesSince;
    if (elapsed < 2000) return;
    const fps = (this.frames * 1000) / elapsed;
    this.frames = 0;
    this.framesSince = now;
    if (this.quality === 'high' && fps < 42) {
      this.quality = 'medium';
      this.renderer.setPixelRatio(this.pixelRatio());
    } else if (this.quality === 'medium' && fps < 30) {
      this.quality = 'low';
      this.keyLight.castShadow = false;
      this.renderer.shadowMap.enabled = false;
      this.renderer.setPixelRatio(this.pixelRatio());
    }
  }

  private handleVisibility = () => {
    // Вкладку свернули — кадры не считаем и таймер броска не двигаем:
    // иначе возвращение показывает кости уже лежащими, а бросок пропущен.
    if (document.hidden) {
      cancelAnimationFrame(this.frame);
    } else if (this.running) {
      this.loop();
    }
  };

  /**
   * Касание по кости — с допуском, а не строго по силуэту.
   *
   * Кость на экране телефона — квадратик примерно в 30 точек, между
   * костями щели вдвое шире. Попасть точно пальцем в такую цель нельзя,
   * и промах ничем не отзывается: игрок думает, что выбор сломан.
   * _Нашлось живой проверкой — тем, что перебор точек по сетке ни разу
   * не выбрал кость, хотя выбор работал._
   *
   * Сначала честный луч (он единственный правильно разбирает кости,
   * лежащие внахлёст), и только при промахе — ближайшая кость в
   * пределах пальца.
   */
  private handlePointer = (event: PointerEvent) => {
    if (!this.interactive || this.throwing()) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.pointer.x = (x / rect.width) * 2 - 1;
    this.pointer.y = -(y / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const visible = this.dice.filter((die) => die.group.visible);
    const hit = this.raycaster.intersectObjects(
      visible.map((die) => die.body),
      false,
    )[0];

    let index =
      typeof hit?.object.userData.dieIndex === 'number'
        ? (hit.object.userData.dieIndex as number)
        : this.nearestDie(visible, x, y, rect.width, rect.height);

    if (index !== null && this.locked.includes(index)) index = null;
    if (index !== null) this.onPick(index);
  };

  /** Ближайшая кость к точке касания — не дальше подушечки пальца. */
  private nearestDie(
    visible: DieView[],
    x: number,
    y: number,
    width: number,
    height: number,
  ): number | null {
    const reach = 34;
    let best: number | null = null;
    let bestDistance = reach;
    const point = new THREE.Vector3();
    for (const die of visible) {
      point.copy(die.group.position).project(this.camera);
      const distance = Math.hypot(
        ((point.x + 1) / 2) * width - x,
        ((1 - point.y) / 2) * height - y,
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = die.index;
      }
    }
    return best;
  }

  private throwing() {
    return this.now() - this.throwAt < DICE_ROLL_MS;
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    const now = this.now();
    const time = (now - this.startedAt) / 1000;

    this.updateCamera(time);
    this.updateTavern(time);
    this.updateCup(now, time);
    this.updateDice(now, time);

    this.renderer.render(this.scene, this.camera);
    this.watchPerformance(now);
  };

  /** Дыхание: сцена должна быть живой, а не фотографией. */
  private updateCamera(time: number) {
    if (this.reducedMotion) return;
    this.camera.position.set(
      CAMERA.position.x + Math.sin(time * 0.53) * 0.006,
      CAMERA.position.y + Math.sin(time * 0.81) * 0.005,
      CAMERA.position.z + Math.sin(time * 0.37) * 0.004,
    );
    this.camera.lookAt(CAMERA.target);
  }

  private updateTavern(time: number) {
    // Свеча: неровное мерцание из двух несоразмерных синусов — ровное
    // колебание читается как лампочка на диммере, а не как огонь.
    const flicker =
      0.86 + Math.sin(time * 9.1) * 0.07 + Math.sin(time * 3.3) * 0.05 + Math.sin(time * 21) * 0.02;
    this.tavern.candleLight.intensity = 2.2 * (this.quality === 'low' ? 1 : flicker);
    this.tavern.flame.scale.set(1, 0.9 + flicker * 0.18, 1);

    const breath = Math.sin(time * 1.1) * 0.006;
    const lean = this.rivalThinking ? 0.055 : 0;
    this.tavern.rival.position.y = breath;
    this.tavern.rival.position.z = RIVAL.z + lean;
    this.tavern.rival.rotation.x = lean * 0.9;
    this.tavern.rivalArms.position.y = breath * 0.4;
  }

  /**
   * Кубок: подъём → встряхивание → наклон → высыпание → возврат.
   *
   * Вне броска он просто стоит на столе своей стороны — по нему видно,
   * чей ход, ещё до того, как игрок прочитает надпись.
   */
  private updateCup(now: number, time: number) {
    const spots = CUP_SPOTS[this.side];
    const pourSign = this.side === 'you' ? -1 : 1;
    const since = now - this.throwAt;
    const group = this.cup.group;

    if (since < 0 || since > DICE_ROLL_MS + 320 || this.reducedMotion) {
      group.position.lerp(spots.rest, 0.12);
      group.rotation.x += (0 - group.rotation.x) * 0.12;
      group.rotation.z = Math.sin(time * 0.7) * 0.01;
      return;
    }

    if (since < CUP_LIFT_MS) {
      const t = ease(since / CUP_LIFT_MS);
      group.position.lerpVectors(spots.rest, spots.shake, t);
      group.rotation.set(0, 0, 0);
    } else if (since < CUP_LIFT_MS + CUP_SHAKE_MS) {
      const t = (since - CUP_LIFT_MS) / 1000;
      group.position.copy(spots.shake);
      group.position.x += Math.sin(t * 46) * 0.016;
      group.position.y += Math.sin(t * 63) * 0.012;
      group.rotation.set(Math.sin(t * 55) * 0.12, 0, Math.sin(t * 41) * 0.14);
    } else if (since < RELEASE_MS) {
      const t = ease((since - CUP_LIFT_MS - CUP_SHAKE_MS) / CUP_TILT_MS);
      group.position.lerpVectors(spots.shake, spots.pour, t);
      group.rotation.set(pourSign * 1.9 * t, 0, 0);
    } else if (since < DICE_ROLL_MS) {
      // Кости уже летят — кубок задерживается наклонённым, потом уходит.
      const t = ease(Math.min(1, (since - RELEASE_MS) / (DICE_ROLL_MS - RELEASE_MS)));
      group.position.lerpVectors(spots.pour, spots.rest, t);
      group.rotation.set(pourSign * 1.9 * (1 - t), 0, 0);
    } else {
      group.position.copy(spots.rest);
      group.rotation.set(0, 0, 0);
    }
  }

  private updateDice(now: number, time: number) {
    const since = now - this.throwAt;
    const count = this.values.length;

    for (const die of this.dice) {
      if (die.index >= count) continue;
      const value = this.values[die.index];
      const rest = this.restSpot(die.index, count);
      const restQuat = faceUpQuaternion(
        value,
        hashRandom(this.rollKey, die.index, 7) * Math.PI * 2,
      );
      const locked = this.locked.includes(die.index);
      const picked = this.picked.includes(die.index);

      if (since >= 0 && since < DICE_ROLL_MS) {
        this.animateFlight(die, since, rest, restQuat);
        continue;
      }

      // Отложенные уезжают из доски на стол перед игроком: их больше не
      // бросают, и в доске они только мешают читать оставшиеся.
      const target = locked ? this.lockedSpot(die.index) : rest.clone();
      if (picked && !locked) target.y += 0.022;
      die.group.position.lerp(target, 0.22);
      die.group.quaternion.slerp(restQuat, 0.25);
      die.group.visible = true;

      // Подсказка «эта кость чего-то стоит» — тёплое свечение; выбранная
      // светится ярче и холоднее, чтобы одно не путалось с другим.
      // Подсветка сильнее, чем кажется нужным на мониторе: кость белая,
      // лежит на светлом сукне под тёплым светом, и слабое свечение на
      // ней не видно вовсе — этой же ошибкой заканчивалась подсказка на
      // плоском столе.
      const glow = picked
        ? 0.65
        : !locked && this.hint.includes(die.index)
          ? 0.3 + Math.sin(time * 3.4) * 0.1
          : 0;
      die.material.emissive.setHex(picked ? 0x6ec3ff : 0xffb054);
      die.material.emissiveIntensity = glow;
      die.material.opacity = 1;
    }
  }

  private animateFlight(
    die: DieView,
    since: number,
    rest: THREE.Vector3,
    restQuat: THREE.Quaternion,
  ) {
    const delay = die.index * 42;
    const local = since - RELEASE_MS - delay;
    const spots = CUP_SPOTS[this.side];

    if (local < 0) {
      // Кость ещё в кубке: держим её у горла, но не показываем.
      die.group.visible = false;
      die.group.position.copy(spots.pour).setY(spots.pour.y + CUP_HEIGHT * 0.4);
      return;
    }
    die.group.visible = true;
    die.material.emissiveIntensity = 0;

    const p = Math.min(1, local / FLIGHT_MS);
    const start = spots.pour
      .clone()
      .add(
        new THREE.Vector3(
          (hashRandom(this.rollKey, die.index, 1) - 0.5) * 0.05,
          0.01 + hashRandom(this.rollKey, die.index, 2) * 0.02,
          (hashRandom(this.rollKey, die.index, 3) - 0.5) * 0.04,
        ),
      );

    const travelled = ease(p);
    die.group.position.lerpVectors(start, rest, travelled);
    // Отскоки: три затухающих подскока вместо решателя столкновений.
    const bounce = Math.abs(Math.cos(p * Math.PI * 3)) * (1 - p) * (start.y - rest.y) * 0.75;
    die.group.position.y = rest.y + (start.y - rest.y) * (1 - travelled) + bounce;

    const axis = new THREE.Vector3(
      hashRandom(this.rollKey, die.index, 4) - 0.5,
      hashRandom(this.rollKey, die.index, 5) - 0.5,
      hashRandom(this.rollKey, die.index, 6) - 0.5,
    ).normalize();
    const speed = 14 + hashRandom(this.rollKey, die.index, 8) * 12;
    const tumbleUntil = Math.min(p, AIM_FROM);
    const tumble = new THREE.Quaternion().setFromAxisAngle(
      axis,
      speed * tumbleUntil * (FLIGHT_MS / 1000),
    );

    if (p <= AIM_FROM) {
      die.group.quaternion.copy(tumble);
    } else {
      // Доворот в нужную грань: значение известно с сервера, и падение
      // обязано закончиться именно им.
      die.group.quaternion.copy(tumble).slerp(restQuat, ease((p - AIM_FROM) / (1 - AIM_FROM)));
    }
  }

  private placeAtRest() {
    const count = this.values.length;
    for (const die of this.dice) {
      if (die.index >= count) continue;
      die.group.position.copy(this.restSpot(die.index, count));
      die.group.quaternion.copy(
        faceUpQuaternion(
          this.values[die.index],
          hashRandom(this.rollKey, die.index, 7) * Math.PI * 2,
        ),
      );
    }
  }

  /**
   * Куда кость ложится в доске.
   *
   * Сетка, а не свободный разброс: свободный даёт слипшиеся кучки, из
   * которых не видно значений, и по ним невозможно попасть пальцем.
   * Клетка заметно больше кости, случайность живёт внутри клетки.
   */
  private restSpot(index: number, count: number): THREE.Vector3 {
    const columns = Math.min(count, 3);
    const rows = Math.ceil(count / 3);
    const column = index % 3;
    const row = Math.floor(index / 3);
    const stepX = 0.088;
    const stepZ = 0.092;
    const x =
      (column - (columns - 1) / 2) * stepX + (hashRandom(this.rollKey, index, 11) - 0.5) * 0.03;
    const z =
      BOARD.centre.z +
      (row - (rows - 1) / 2) * stepZ +
      (hashRandom(this.rollKey, index, 12) - 0.5) * 0.03;
    return new THREE.Vector3(BOARD.centre.x + x, DIE_REST_Y, z);
  }

  /** Ряд отложенных костей на столе перед игроком. */
  private lockedSpot(index: number): THREE.Vector3 {
    const place = this.locked.indexOf(index);
    const total = Math.max(1, this.locked.length);
    return new THREE.Vector3(
      (place - (total - 1) / 2) * (DIE_SIZE + 0.014),
      DIE_SIZE / 2,
      BOARD.centre.z + BOARD.halfZ + 0.05,
    );
  }
}

function ease(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - clamped, 3);
}
