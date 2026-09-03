/**
 * Nicknames are the only name other players ever see, so a name that reads
 * as "Админ" is a working impersonation of the app itself — no exploit
 * needed, just a convincing label next to someone's messages.
 *
 * Two separate defences, because either alone is trivial to walk around:
 *
 *  1. **Normalisation.** `\p{L}` matches every Unicode letter, including
 *     styled alphabets — which is how `𝓐𝓭𝓶𝓲𝓷` passed validation while
 *     reading exactly like "Admin". NFKC folds those styled forms back to
 *     plain letters, so the stored name is what a reader actually sees, and
 *     the uniqueness constraint stops treating two identical-looking names
 *     as different people.
 *
 *  2. **A comparison skeleton.** Reserved words are matched against a
 *     stripped-down form of the name — case folded, separators removed,
 *     Cyrillic/Latin lookalikes and digit-for-letter swaps collapsed — so
 *     `А­дм1н_`, `a.d.m.i.n` and `ADMIN` all resolve to the same thing.
 */

/** Latin/Cyrillic lookalikes and the usual digit substitutions, folded to
 * one canonical letter each. Only used for the reserved-word comparison —
 * never for what gets stored. */
const CONFUSABLES: Record<string, string> = {
  а: 'a',
  е: 'e',
  о: 'o',
  р: 'p',
  с: 'c',
  у: 'y',
  х: 'x',
  к: 'k',
  в: 'b',
  н: 'h',
  м: 'm',
  т: 't',
  і: 'i',
  ѕ: 's',
  ј: 'j',
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'b',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'i',
};

/** Names nobody but the app itself may use. Compared as skeletons, so each
 * entry also covers its lookalike spellings. */
const RESERVED_NICKNAMES = [
  'admin',
  'administrator',
  'админ',
  'администратор',
  'moderator',
  'модератор',
  'модер',
  'support',
  'поддержка',
  'помощь',
  'help',
  'staff',
  'team',
  'команда',
  'system',
  'система',
  'бот',
  'bot',
  'biblearena',
  'библейскаяарена',
  'арена',
  'official',
  'официальный',
  'security',
  'безопасность',
];

/** What actually gets stored: styled/compatibility characters folded to
 * their plain equivalents, surrounding whitespace removed. */
export function normalizeNickname(raw: string): string {
  return raw.normalize('NFKC').trim();
}

/** The comparison form — never stored, only used to test against the
 * reserved list.
 *
 * `digits` decides what a digit means, and both readings are needed
 * because they catch opposite tricks: folding turns "Adm1n" into "admin",
 * while stripping turns "admin_1" into "admin". Fold alone misses the
 * second (the "1" becomes an "i", giving "admini"), strip alone misses the
 * first. `isReservedNickname` therefore tests both. */
export function nicknameSkeleton(raw: string, digits: 'fold' | 'strip' = 'fold'): string {
  const folded = normalizeNickname(raw).toLowerCase();
  let out = '';
  for (const char of folded) {
    if (char === '_' || char === '-' || char === '.' || char === ' ') continue;
    if (digits === 'strip' && char >= '0' && char <= '9') continue;
    out += CONFUSABLES[char] ?? char;
  }
  return out;
}

/** The reserved words reduced to the same skeleton form a candidate is.
 * Comparing a skeleton against raw words silently fails for every Cyrillic
 * entry — "админ" folds to "aдmиh", which matches nothing in a raw list —
 * so both sides have to go through the same reduction. */
const RESERVED_SKELETONS = RESERVED_NICKNAMES.map((word) => nicknameSkeleton(word));

/** True when the name impersonates the app or its staff.
 *
 * Requires the *whole* skeleton to match a reserved word under one of the
 * two digit readings, rather than merely containing one: "Админов" is a
 * surname, not an impersonation attempt, and blocking it would be a worse
 * failure than letting "superadmin" through. */
export function isReservedNickname(raw: string): boolean {
  const candidates = [nicknameSkeleton(raw), nicknameSkeleton(raw, 'strip')];
  return candidates.some((candidate) => !!candidate && RESERVED_SKELETONS.includes(candidate));
}

export const RESERVED_NICKNAME_MESSAGE = 'Этот никнейм зарезервирован — выберите другой';
