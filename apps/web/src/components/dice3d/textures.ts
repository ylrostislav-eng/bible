import * as THREE from 'three';
import { mulberry32 } from './rand';

/**
 * Текстуры рисуются на canvas прямо в браузере, а не грузятся файлами.
 *
 * Дерево стола, сукно доски и стена таверны в приличном разрешении —
 * это мегабайты картинок, которые внутри Telegram грузятся по мобильной
 * сети и до первого кадра показывают серые заглушки. Здесь всё это
 * считается за пару миллисекунд и весит ноль.
 *
 * Обратная сторона: рисунок должен быть детерминированным, иначе стол
 * будет разным при каждом входе. Отсюда `mulberry32` с постоянным
 * зерном вместо `Math.random`.
 */

function canvas(size: number): { ctx: CanvasRenderingContext2D; element: HTMLCanvasElement } {
  const element = document.createElement('canvas');
  element.width = size;
  element.height = size;
  const ctx = element.getContext('2d');
  if (!ctx) throw new Error('Нет 2D-контекста для текстуры');
  return { ctx, element };
}

function finish(element: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 4;
  return texture;
}

/** Столешница: старое тёмное дерево, вдоль волокон, с потёртостями. */
export function woodTexture(): THREE.CanvasTexture {
  const size = 512;
  const { ctx, element } = canvas(size);
  const random = mulberry32(20260909);

  ctx.fillStyle = '#4b3423';
  ctx.fillRect(0, 0, size, size);

  // Доски столешницы: широкие полосы разного тона — так дерево читается
  // столом, а не однородной коричневой заливкой.
  const planks = 5;
  for (let i = 0; i < planks; i++) {
    const y = (i * size) / planks;
    const tone = 30 + random() * 22;
    ctx.fillStyle = `rgb(${58 + tone}, ${40 + tone * 0.62}, ${26 + tone * 0.38})`;
    ctx.fillRect(0, y, size, size / planks - 1);
    ctx.fillStyle = 'rgba(20,12,7,0.55)';
    ctx.fillRect(0, y + size / planks - 2, size, 2);
  }

  // Волокна.
  for (let i = 0; i < 1400; i++) {
    const y = random() * size;
    const x = random() * size;
    const length = 30 + random() * 180;
    ctx.strokeStyle = `rgba(${random() < 0.5 ? '26,16,9' : '150,112,68'},${0.03 + random() * 0.09})`;
    ctx.lineWidth = 0.6 + random() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + length * 0.4,
      y + (random() - 0.5) * 6,
      x + length * 0.7,
      y + (random() - 0.5) * 6,
      x + length,
      y,
    );
    ctx.stroke();
  }

  // Сучки и следы от кружек: стол должен выглядеть много раз игранным.
  for (let i = 0; i < 7; i++) {
    const x = random() * size;
    const y = random() * size;
    const r = 4 + random() * 9;
    const knot = ctx.createRadialGradient(x, y, 0, x, y, r);
    knot.addColorStop(0, 'rgba(28,17,9,0.8)');
    knot.addColorStop(1, 'rgba(28,17,9,0)');
    ctx.fillStyle = knot;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 4; i++) {
    const x = random() * size;
    const y = random() * size;
    ctx.strokeStyle = 'rgba(24,14,8,0.28)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, 16 + random() * 12, 0, Math.PI * 2);
    ctx.stroke();
  }

  return finish(element, 2);
}

/** Дно доски: вытертое сукно, по которому катятся кости. */
export function feltTexture(): THREE.CanvasTexture {
  const size = 256;
  const { ctx, element } = canvas(size);
  const random = mulberry32(770077);

  ctx.fillStyle = '#2f3a2b';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i++) {
    const x = random() * size;
    const y = random() * size;
    ctx.fillStyle = `rgba(${random() < 0.5 ? '18,24,16' : '86,102,74'},${0.05 + random() * 0.12})`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  // Вытертая середина — там, где кости падают чаще всего.
  const worn = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  worn.addColorStop(0, 'rgba(122,132,98,0.20)');
  worn.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = worn;
  ctx.fillRect(0, 0, size, size);

  return finish(element, 1);
}

/** Стена за спиной соперника: тёмная штукатурка, чтобы была глубина. */
export function wallTexture(): THREE.CanvasTexture {
  const size = 256;
  const { ctx, element } = canvas(size);
  const random = mulberry32(31337);

  ctx.fillStyle = '#241a13';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 6000; i++) {
    const x = random() * size;
    const y = random() * size;
    ctx.fillStyle = `rgba(${random() < 0.5 ? '12,8,5' : '74,56,40'},${0.05 + random() * 0.1})`;
    ctx.fillRect(x, y, 2, 2);
  }
  return finish(element, 3);
}
