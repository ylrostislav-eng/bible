/**
 * Settings that decide whether the app is usable at all, rather than how
 * it looks.
 *
 * Both come straight from the audit's two hardest findings, and both hit
 * the same two groups from opposite directions: the youngest players, who
 * read slowly because they're learning to read, and the oldest, who read
 * slowly because the timer and the type size are working against them.
 */

/**
 * How long a question in the solo chapter check-up waits.
 *
 * Only the chapter check is adjustable, and that is a deliberate line:
 * duels and rooms share one clock between people who are competing with
 * each other, so a per-player timer there wouldn't be a setting, it would
 * be an advantage. The check-up has no opponent, so its timer was never
 * measuring anything except reading speed — which is exactly the thing it
 * shouldn't be measuring for someone who knows the answer best.
 */
export const QUESTION_PACES = ['NORMAL', 'RELAXED', 'UNTIMED'] as const;
export type QuestionPace = (typeof QUESTION_PACES)[number];

export const QUESTION_PACE_LABELS: Record<QuestionPace, string> = {
  NORMAL: 'Обычный',
  RELAXED: 'Спокойный',
  UNTIMED: 'Без таймера',
};

export const QUESTION_PACE_DESCRIPTIONS: Record<QuestionPace, string> = {
  NORMAL: '20 секунд на вопрос',
  RELAXED: '45 секунд на вопрос',
  UNTIMED: 'Столько времени, сколько нужно',
};

/** Seconds per question, by pace. `UNTIMED` is a very large number rather
 * than a special case threaded through every check: a day per question is
 * indistinguishable from no limit to a person, and it keeps the timing
 * code a single subtraction everywhere. */
export const QUESTION_PACE_SECONDS: Record<QuestionPace, number> = {
  /** Unchanged from what the check-up always allowed. Picking a smaller
   * number here would have quietly taken time away from exactly the people
   * this setting exists for. */
  NORMAL: 20,
  RELAXED: 45,
  UNTIMED: 86_400,
};

export function isUntimed(pace: QuestionPace): boolean {
  return pace === 'UNTIMED';
}

/**
 * Interface text size.
 *
 * A whole-app scale rather than a handful of enlarged labels: someone who
 * needs bigger text needs it on the answer buttons too, not only on
 * headings.
 */
export const TEXT_SCALES = ['NORMAL', 'LARGE', 'XLARGE'] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

export const TEXT_SCALE_LABELS: Record<TextScale, string> = {
  NORMAL: 'Обычный',
  LARGE: 'Крупный',
  XLARGE: 'Очень крупный',
};

/** Multiplier applied to the app's root font size. Kept modest at the top
 * end — past about 1.35 the fixed-height buttons and the bottom navigation
 * start clipping their own text, which helps nobody. */
export const TEXT_SCALE_FACTORS: Record<TextScale, number> = {
  NORMAL: 1,
  LARGE: 1.15,
  XLARGE: 1.3,
};
