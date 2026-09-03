export interface TitleTier {
  name: string;
  /** Title applies once rating reaches (or, on the negative side, drops to
   * or below) this value. */
  threshold: number;
}

/**
 * Positive title ladder, ascending. `Ищущий` is both the title given at
 * registration (starting rating is 100) and the floor for anyone who has
 * dipped below 100 without going negative.
 *
 * **The curve is anchored to what the game actually pays**, because the
 * first version wasn't: the second title sat at 3000 while an ordinary
 * daily player earns roughly 40 rating a day (one chapter check at +5 per
 * correct answer, minus wrong ones, plus a duel win or two at +10). That's
 * two and a half months to move one step off the starting label — long
 * enough that the ladder reads as broken rather than as a long climb.
 * A player pushing every mode to its daily cap tops out near 300/day
 * (10 duel wins = 100, the room cap = 100, chapter checks ≈ 100).
 *
 * So the pacing below is written against those two rates — ~40/day for
 * someone who just shows up, ~250/day for someone chasing it:
 *
 *   Слушающий        250     ≈ 6 дней  /  1 день
 *   Читающий         500     ≈ 13 дней /  2 дня
 *   Прилежный ученик 1000    ≈ 25 дней /  4 дня
 *   Хранитель Слова  2000    ≈ 7 недель/  8 дней
 *   …
 *   Верный до конца  150000  — многолетний путь даже для самых упорных
 *
 * Free to retune any time: the title is always derived from the current
 * rating, never stored, so changing these numbers instantly re-labels
 * everyone with no migration.
 */
export const POSITIVE_TITLES: TitleTier[] = [
  { name: 'Ищущий', threshold: 0 },
  { name: 'Слушающий', threshold: 250 },
  { name: 'Читающий', threshold: 500 },
  { name: 'Прилежный ученик', threshold: 1000 },
  { name: 'Хранитель Слова', threshold: 2000 },
  { name: 'Пастух', threshold: 3500 },
  { name: 'Служитель', threshold: 6000 },
  { name: 'Наставник', threshold: 10000 },
  { name: 'Добрый Пастырь', threshold: 16000 },
  { name: 'Благовестник', threshold: 25000 },
  { name: 'Старейшина', threshold: 38000 },
  { name: 'Мудрый старейшина', threshold: 55000 },
  { name: 'Столп общины', threshold: 80000 },
  { name: 'Свет миру', threshold: 110000 },
  { name: 'Верный до конца', threshold: 150000 },
];

/** Negative title ladder — a flat -100 step per tier, deliberately blunt. */
export const NEGATIVE_TITLES: TitleTier[] = [
  { name: 'Заблудшая овца', threshold: -100 },
  { name: 'Спящий на страже', threshold: -200 },
  { name: 'Фома неверующий', threshold: -300 },
  { name: 'Потерявший счёт', threshold: -400 },
  { name: 'Друг Голиафа', threshold: -500 },
  { name: 'Строитель на песке', threshold: -600 },
  { name: 'Продавец чечевичной похлёбки', threshold: -700 },
  { name: 'Ходящий кругами', threshold: -Infinity },
];

const ALL_TITLES: TitleTier[] = [...NEGATIVE_TITLES, ...POSITIVE_TITLES].sort(
  (a, b) => a.threshold - b.threshold,
);

/** The title for a given rating — the highest threshold not above it. */
export function getTitleForRating(rating: number): string {
  let current = ALL_TITLES[0].name;
  for (const tier of ALL_TITLES) {
    if (rating >= tier.threshold) {
      current = tier.name;
    } else {
      break;
    }
  }
  return current;
}

export interface TitleProgress {
  title: string;
  /** The next rung up, or null at the top of the ladder. */
  nextTitle: string | null;
  /** Rating still needed for `nextTitle`; null at the top. */
  ratingToNext: number | null;
  /** How far along the current rung, 0–100. 100 at the top of the ladder. */
  percent: number;
}

/**
 * The current title plus how far it is to the next one.
 *
 * A title alone is a label; a title with "ещё 180 до «Читающий»" is a
 * reason to play one more game today. Only the positive ladder gets a
 * "next" — telling someone on a negative rating how far they are from the
 * next negative title would be pointing them downhill.
 */
export function getTitleProgress(rating: number): TitleProgress {
  const title = getTitleForRating(rating);

  const nextTier = POSITIVE_TITLES.find((tier) => rating < tier.threshold);
  if (!nextTier) {
    return { title, nextTitle: null, ratingToNext: null, percent: 100 };
  }

  // Where this rung started: the highest positive threshold already passed,
  // or 0 for anyone below the first one (including negative ratings, so the
  // bar reads as empty rather than as some fraction of a negative span).
  const currentThreshold = [...POSITIVE_TITLES]
    .reverse()
    .find((tier) => rating >= tier.threshold)?.threshold;
  const from = currentThreshold ?? 0;
  const span = nextTier.threshold - from;
  const done = Math.max(0, rating - from);

  return {
    title,
    nextTitle: nextTier.name,
    ratingToNext: nextTier.threshold - rating,
    // Floor, not round: at 249 of 250 the rung isn't finished, and a bar
    // reading 100% next to an unchanged title looks like a bug.
    percent: span > 0 ? Math.min(99, Math.floor((done / span) * 100)) : 0,
  };
}
