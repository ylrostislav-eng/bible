import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

/**
 * Запись живого звука приложения в WAV.
 *
 *     node scripts/record-music.mjs [секунд]   # → hearth.wav рядом
 *
 * Существует потому, что музыку нельзя проверить по коду: «аккорды на
 * месте» ничего не говорит о том, приятно ли это слушать. Первая версия
 * подложки была технически исправна и при этом никуда не годилась.
 *
 * Ничего не дублирует: подменяется только `destination` контекста — всё,
 * что приложение туда подключает, попадает и в запись. Так слушается
 * ровно тот код, который поедет игроку, а не его копия в скрипте.
 *
 * Нужен поднятый веб (:3000) и API (:3001), и включённая музыка в
 * профиле того слота, под которым заходим.
 */
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
page.on('pageerror', (e) => console.log('ОШИБКА СТРАНИЦЫ:', e.message));

await page.addInitScript(() => {
  const Real = window.AudioContext;
  // `destination` живёт на BaseAudioContext, а не на AudioContext —
  // ищем по цепочке прототипов, иначе дескриптор undefined.
  let proto = Real.prototype;
  let descriptor = null;
  while (proto && !descriptor) {
    descriptor = Object.getOwnPropertyDescriptor(proto, 'destination');
    proto = Object.getPrototypeOf(proto);
  }
  const realDestination = descriptor.get;
  window.__pcm = [];
  window.__capture = false;
  window.AudioContext = class extends Real {
    constructor(...args) {
      super(...args);
      const out = realDestination.call(this);
      const sink = this.createGain();
      const proc = this.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = (event) => {
        if (!window.__capture) return;
        window.__pcm.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      sink.connect(proc);
      proc.connect(out);
      sink.connect(out);
      window.__rate = this.sampleRate;
      Object.defineProperty(this, 'destination', { get: () => sink, configurable: true });
    }
  };
});

await page.goto('http://localhost:3000/?devSlot=4', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
const dev = page.getByRole('button', { name: /тестовый пользователь/i });
if (await dev.count()) {
  await dev.click();
  await page.waitForTimeout(4500);
}
console.log('адрес:', page.url());

// Ждём, пока музыка выйдет на полную громкость (вход — четыре секунды).
await page.waitForTimeout(6000);
await page.evaluate(() => {
  window.__capture = true;
});
const SECONDS = Number(process.argv[2] ?? 34);
await page.waitForTimeout(SECONDS * 1000);
await page.evaluate(() => {
  window.__capture = false;
});

const wav = await page.evaluate(() => {
  const chunks = window.__pcm;
  const rate = window.__rate;
  let length = 0;
  for (const c of chunks) length += c.length;
  const samples = new Float32Array(length);
  let at = 0;
  for (const c of chunks) {
    samples.set(c, at);
    at += c.length;
  }
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));

  // Нормализация только для прослушивания: в приложении громкость своя,
  // здесь надо просто услышать характер.
  const gain = peak > 0 ? 0.85 / peak : 1;
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const ascii = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i] * gain));
    view.setInt16(44 + i * 2, value * 0x7fff, true);
  }
  let binary = '';
  const raw = new Uint8Array(bytes);
  for (let i = 0; i < raw.length; i += 1) binary += String.fromCharCode(raw[i]);
  return { base64: btoa(binary), peak, seconds: samples.length / rate };
});

writeFileSync(process.env.MUSIC_OUT ?? 'hearth.wav', Buffer.from(wav.base64, 'base64'));
console.log(`записано ${wav.seconds.toFixed(1)} с, пик ${wav.peak.toFixed(3)}`);
await browser.close();
