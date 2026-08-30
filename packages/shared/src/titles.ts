export interface TitleTier {
  name: string;
  /** Title applies once rating reaches (or, on the negative side, drops to
   * or below) this value. */
  threshold: number;
}

/**
 * Positive title ladder, ascending. `Ищущий` is both the title given at
 * registration (starting rating is 100) and the floor for anyone who has
 * dipped below 100 without going negative. Thresholds are a deliberate
 * pacing curve — quick wins early (days/weeks), a long multi-year climb at
 * the top — not a measured fact about anything. Free to retune any time:
 * the title is always derived from the current rating, never stored, so
 * changing these numbers instantly re-labels everyone with no migration.
 */
export const POSITIVE_TITLES: TitleTier[] = [
  { name: 'Ищущий', threshold: 0 },
  { name: 'Слушающий', threshold: 3000 },
  { name: 'Читающий', threshold: 5000 },
  { name: 'Прилежный ученик', threshold: 8000 },
  { name: 'Хранитель Слова', threshold: 13000 },
  { name: 'Пастух', threshold: 20000 },
  { name: 'Служитель', threshold: 30000 },
  { name: 'Наставник', threshold: 44000 },
  { name: 'Добрый Пастырь', threshold: 64000 },
  { name: 'Благовестник', threshold: 90000 },
  { name: 'Старейшина', threshold: 130000 },
  { name: 'Мудрый старейшина', threshold: 180000 },
  { name: 'Столп общины', threshold: 260000 },
  { name: 'Свет миру', threshold: 380000 },
  { name: 'Верный до конца', threshold: 540000 },
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
