import { SpellIndex } from '/home/user/bible/packages/shared/dist/index.js';
const alphabet = 'абвгдежзийклмнопрстуфхцчшщыэюя';
let seed = 7;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const t0 = Date.now();
const words = new Set(['авраам','иерусалим','женщина','предатель','животное']);
let guard = 0;
while (words.size < 120000 && guard < 3_000_000) {
  guard++;
  const n = 5 + Math.floor(rnd()*7); let w='';
  for (let i=0;i<n;i++) w += alphabet[Math.floor(rnd()*alphabet.length)];
  words.add(w);
}
console.log(`словарь ${words.size} за ${Date.now()-t0} мс (итераций ${guard})`);
const list = [...words];
const t1 = Date.now();
const index = new SpellIndex(list);
console.log(`индекс: ${Date.now()-t1} мс`);
const probes = ['авраамм','иерусалм','жеснщина','предатльне','жывотное','ыыыыыыыы'];
const t2 = Date.now();
for (let i=0;i<10;i++) for (const p of probes) index.findClosest(p);
console.log(`60 поисков: ${Date.now()-t2} мс`);
for (const p of probes) console.log(`  ${p} → ${index.findClosest(p) ?? 'не найдено'}`);
console.log(`память: ${(process.memoryUsage().heapUsed/1e6).toFixed(0)} МБ`);
