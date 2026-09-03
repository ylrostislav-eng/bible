/**
 * Age band, asked once during onboarding.
 *
 * Two separate jobs, and it helps to keep them apart:
 *
 *  1. **Safety.** `CHILD` turns on a reduced-contact mode — no browsing or
 *     joining strangers' public rooms, and the account isn't discoverable by
 *     a partial nickname search. Chat was already friends-only, so with
 *     these two the only people who can reach a child are people the child
 *     (or their guardian) deliberately added.
 *
 *  2. **Tone, later.** Difficulty wording, reminder frequency and the
 *     harsher end of the title ladder should read differently for a nine-
 *     year-old and for a sixty-year-old. Nothing uses the band for that yet;
 *     it's stored so those features have something honest to read.
 *
 * The band is self-declared and is not, and can't be, an identity check —
 * an app has no way to verify a birth year. What it *can* do is make the
 * safe setting easy to choose and hard to flip back by accident, which is
 * what the optional guardian PIN is for.
 */
export const AGE_BANDS = ['CHILD', 'TEEN', 'ADULT'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const AGE_BAND_LABELS: Record<AgeBand, string> = {
  CHILD: 'До 12 лет',
  TEEN: '13–17 лет',
  ADULT: '18 лет и старше',
};

/** Shown next to each option so the choice is made knowingly rather than
 * tapped through — a parent picking for a child should see what changes. */
export const AGE_BAND_DESCRIPTIONS: Record<AgeBand, string> = {
  CHILD: 'Игра только с друзьями: открытые комнаты незнакомцев скрыты',
  TEEN: 'Все режимы игры доступны',
  ADULT: 'Все режимы игры доступны',
};

export function isChildBand(band: AgeBand | null | undefined): boolean {
  return band === 'CHILD';
}

/** Guardian PIN: short enough to remember, long enough that a child doesn't
 * guess it on the tenth try. Digits only — it's typed on a phone. */
export const GUARDIAN_PIN_LENGTH = 4;
export const GUARDIAN_PIN_PATTERN = /^[0-9]{4}$/;

export const CHILD_MODE_ROOMS_MESSAGE = 'В детском режиме доступны только комнаты друзей';
export const CHILD_MODE_PIN_MESSAGE =
  'Изменить возрастной режим можно только с родительским PIN-кодом';

/**
 * What the guardian confirms on the child-mode screen.
 *
 * This is a plain description of what the app does — deliberately factual,
 * not a legal notice. The consent wording an app store or a data-protection
 * regime requires (who may consent, from what age, and what has to be
 * disclosed) depends on the jurisdiction and is the owner's decision, not
 * something this file should invent. Replace or extend this text once that
 * policy exists; the mechanism (`guardianConfirmedAt`) already records that
 * it was shown and accepted.
 */
export const GUARDIAN_CONSENT_POINTS = [
  'Ребёнок будет играть и переписываться только с теми, кого сам добавил в друзья',
  'Открытые комнаты незнакомых игроков скрыты',
  'Никнейм ребёнка не находится по частичному поиску — только по точному совпадению',
  'На любое сообщение или игрока можно пожаловаться — жалобы разбирает модерация',
];
