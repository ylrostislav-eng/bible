/**
 * Achievements.
 *
 * Two rules shaped this list, both learned from the audit:
 *
 *  1. **Every one of them is measurable from what the app already records.**
 *     No achievement here needs a new counter or a new event stream, so
 *     none of them can silently stop working — and, just as importantly,
 *     they all count history that already exists, so a player who has been
 *     around for months doesn't start from zero.
 *
 *  2. **They reward showing up and breadth, not grinding.** There is no
 *     "win 500 duels": that's a target only a person with nothing else to
 *     do reaches, and it makes everyone else's list look permanently
 *     unfinished. The ladders stop where an ordinary committed player can
 *     actually arrive.
 */
export const ACHIEVEMENT_CATEGORIES = ['STREAK', 'GAMES', 'DUELS', 'LEARNING', 'SOCIAL'] as const;
export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number];

export const ACHIEVEMENT_CATEGORY_NAMES: Record<AchievementCategory, string> = {
  STREAK: 'Постоянство',
  GAMES: 'Игры',
  DUELS: 'Дуэли',
  LEARNING: 'Изучение',
  SOCIAL: 'Друзья',
};

/** Which measured number an achievement is counted against. The server maps
 * each of these to a value it already has; adding a definition never means
 * adding tracking. */
export type AchievementMetric =
  'longestStreak' | 'gamesPlayed' | 'duelWins' | 'chaptersChecked' | 'booksTouched' | 'friends';

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  metric: AchievementMetric;
  /** Value of `metric` at which it unlocks. */
  target: number;
  /** One-time coin reward. Scaled to this app's economy — a perfect chapter
   * check earns a handful of coins, so these are meaningful without being
   * a shortcut past playing. */
  coins: number;
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  // Постоянство — считается по рекорду серии, а не по текущей: достижение,
  // которое отбирают обратно за один пропущенный день, наказывает за жизнь
  // вне приложения.
  {
    id: 'streak_1',
    name: 'Первый шаг',
    description: 'Сыграть в первый день',
    icon: '🌱',
    category: 'STREAK',
    metric: 'longestStreak',
    target: 1,
    coins: 10,
  },
  {
    id: 'streak_7',
    name: 'Неделя со Словом',
    description: 'Серия из 7 дней',
    icon: '🕯️',
    category: 'STREAK',
    metric: 'longestStreak',
    target: 7,
    coins: 30,
  },
  {
    id: 'streak_30',
    name: 'Месяц верности',
    description: 'Серия из 30 дней',
    icon: '🔥',
    category: 'STREAK',
    metric: 'longestStreak',
    target: 30,
    coins: 100,
  },
  {
    id: 'streak_100',
    name: 'Сто дней подряд',
    description: 'Серия из 100 дней',
    icon: '💎',
    category: 'STREAK',
    metric: 'longestStreak',
    target: 100,
    coins: 300,
  },

  {
    id: 'games_1',
    name: 'Начало пути',
    description: 'Завершить первую игру',
    icon: '🎯',
    category: 'GAMES',
    metric: 'gamesPlayed',
    target: 1,
    coins: 10,
  },
  {
    id: 'games_50',
    name: 'Полсотни',
    description: 'Завершить 50 игр',
    icon: '🏅',
    category: 'GAMES',
    metric: 'gamesPlayed',
    target: 50,
    coins: 60,
  },
  {
    id: 'games_200',
    name: 'Двести партий',
    description: 'Завершить 200 игр',
    icon: '🏆',
    category: 'GAMES',
    metric: 'gamesPlayed',
    target: 200,
    coins: 200,
  },

  {
    id: 'duel_win_1',
    name: 'Первая победа',
    description: 'Выиграть дуэль',
    icon: '⚔️',
    category: 'DUELS',
    metric: 'duelWins',
    target: 1,
    coins: 15,
  },
  {
    id: 'duel_win_10',
    name: 'Десять побед',
    description: 'Выиграть 10 дуэлей',
    icon: '🛡️',
    category: 'DUELS',
    metric: 'duelWins',
    target: 10,
    coins: 60,
  },
  {
    id: 'duel_win_50',
    name: 'Полсотни побед',
    description: 'Выиграть 50 дуэлей',
    icon: '👑',
    category: 'DUELS',
    metric: 'duelWins',
    target: 50,
    coins: 200,
  },

  // Изучение считается по разным главам и разным книгам, а не по числу
  // проверок: иначе выгоднее гонять одну знакомую главу по кругу, а смысл
  // ровно обратный — пройти Писание вширь.
  {
    id: 'chapters_1',
    name: 'Первая глава',
    description: 'Пройти проверку по главе',
    icon: '📖',
    category: 'LEARNING',
    metric: 'chaptersChecked',
    target: 1,
    coins: 10,
  },
  {
    id: 'chapters_10',
    name: 'Десять глав',
    description: 'Проверить 10 разных глав',
    icon: '📚',
    category: 'LEARNING',
    metric: 'chaptersChecked',
    target: 10,
    coins: 50,
  },
  {
    id: 'chapters_50',
    name: 'Полсотни глав',
    description: 'Проверить 50 разных глав',
    icon: '🗝️',
    category: 'LEARNING',
    metric: 'chaptersChecked',
    target: 50,
    coins: 150,
  },
  {
    id: 'books_5',
    name: 'Пять книг',
    description: 'Заглянуть в 5 разных книг Библии',
    icon: '🧭',
    category: 'LEARNING',
    metric: 'booksTouched',
    target: 5,
    coins: 60,
  },
  {
    id: 'books_15',
    name: 'Пятнадцать книг',
    description: 'Заглянуть в 15 разных книг Библии',
    icon: '🌍',
    category: 'LEARNING',
    metric: 'booksTouched',
    target: 15,
    coins: 180,
  },

  {
    id: 'friends_1',
    name: 'Не один',
    description: 'Добавить первого друга',
    icon: '🤝',
    category: 'SOCIAL',
    metric: 'friends',
    target: 1,
    coins: 15,
  },
  {
    id: 'friends_5',
    name: 'Своя компания',
    description: 'Пять друзей в списке',
    icon: '🫂',
    category: 'SOCIAL',
    metric: 'friends',
    target: 5,
    coins: 50,
  },
];

export interface AchievementView {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  target: number;
  coins: number;
  /** Current value of the measured number, clamped to `target` for display. */
  progress: number;
  unlocked: boolean;
  /** ISO timestamp, or null while still locked. */
  unlockedAt: string | null;
}

export interface AchievementsResponse {
  achievements: AchievementView[];
  unlockedCount: number;
  totalCount: number;
  /**
   * Unlocked within the last few minutes — the client shows these as a
   * "new" highlight rather than making the player spot the change.
   *
   * A time window rather than "unlocked by this very request", which is
   * what it was first written as. That version reported the moment exactly
   * once, so any second fetch — a remount, a refresh, React's development
   * double-mount — answered with an empty list and wiped the celebration
   * off the screen before it was read. A short window is robust to all of
   * that and still closes on its own.
   */
  newlyUnlocked: AchievementView[];
}
