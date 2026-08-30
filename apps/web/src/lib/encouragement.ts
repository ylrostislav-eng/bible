const PERFECT = [
  'Без единой ошибки — как добрый и верный раб!',
  'Всё верно — талант не зарыт в землю.',
  'Идеально! Твоя вера крепка.',
  'Ни одной ошибки — продолжай нести свет.',
  'Полный порядок — Слово хорошо легло на сердце.',
];

const GOOD = [
  'Отлично! Ты крепко держишься истины.',
  'Хороший результат — продолжай в том же духе.',
  'Почти всё верно, так держать!',
  'Уверенный шаг вперёд.',
  'Достойно — знание Писания растёт.',
];

const MID = [
  'Неплохо — но есть, над чем поработать.',
  'Половина пути пройдена, не останавливайся.',
  'Продолжай читать и разбирать — результат будет расти.',
  'Есть над чем подумать — попробуй ещё раз.',
  'Твёрдая почва под ногами, шагов впереди ещё много.',
];

const LOW = [
  'Не беда — каждый путь начинается с малого шага.',
  'Попробуй ещё раз — Слово открывается не сразу.',
  'Это только начало пути.',
  'Не отчаивайся — вернись и перечитай ещё раз.',
  'Каждая ошибка — повод заглянуть в текст ещё раз.',
];

function pick(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Picks a random Bible-themed encouragement line for a completion screen,
 * varied every time so the same result doesn't always show the same text. */
export function pickEncouragement(percentCorrect: number): string {
  if (percentCorrect >= 1) return pick(PERFECT);
  if (percentCorrect >= 0.7) return pick(GOOD);
  if (percentCorrect >= 0.4) return pick(MID);
  return pick(LOW);
}
