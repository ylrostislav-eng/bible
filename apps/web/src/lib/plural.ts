/** Russian noun declension by count (1 форма, 2 формы, 5 форм). */
export function pluralize(n: number, [one, few, many]: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

export function pluralDays(n: number): string {
  return pluralize(n, ['день', 'дня', 'дней']);
}

export function pluralCoins(n: number): string {
  return pluralize(n, ['монета', 'монеты', 'монет']);
}

export function pluralDuels(n: number): string {
  return pluralize(n, ['дуэль', 'дуэли', 'дуэлей']);
}

export function pluralWins(n: number): string {
  return pluralize(n, ['победа', 'победы', 'побед']);
}

export function pluralLosses(n: number): string {
  return pluralize(n, ['поражение', 'поражения', 'поражений']);
}

export function pluralDraws(n: number): string {
  return pluralize(n, ['ничья', 'ничьи', 'ничьих']);
}
