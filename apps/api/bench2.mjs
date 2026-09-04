import { SpellIndex } from '/home/user/bible/packages/shared/dist/index.js';
const alphabet = 'абвгдежзийклмнопрстуфхцчшщыэюя';
let seed = 42;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
for (const size of [5000, 20000, 60000]) {
  const words = new Set(['авраам','иерусалим','женщина']);
  while (words.size < size) { const n = 4 + Math.floor(rnd()*8); let w=''; for (let i=0;i<n;i++) w += alphabet[Math.floor(rnd()*alphabet.length)]; words.add(w); }
  const list = [...words];
  const t0 = Date.now();
  const index = new SpellIndex(list);
  const t1 = Date.now();
  for (let i = 0; i < 20; i++) index.findClosest('авраамм');
  const t2 = Date.now();
  console.log(`${size}: индекс ${t1-t0} мс, 20 поисков ${t2-t1} мс`);
}
