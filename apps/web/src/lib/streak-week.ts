const WEEKDAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export interface StreakWeekDay {
  label: string;
  done: boolean;
  isToday: boolean;
}

/**
 * The last seven days, marked from the streak length.
 *
 * `activeToday` is what makes this honest. A streak of 3 means three days
 * ending on the last day played — which is today only if today's game is
 * already in. Without that distinction the strip filled today's circle the
 * moment the app opened, telling a player the day was done when it wasn't,
 * and then "losing" the mark once they actually played.
 */
export function buildStreakWeek(currentStreak: number, activeToday: boolean): StreakWeekDay[] {
  const today = new Date();
  // How many days back the streak's last day sits: today if it's played,
  // otherwise yesterday.
  const lastDayOffset = activeToday ? 0 : 1;
  const days: StreakWeekDay[] = [];

  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    days.push({
      label: WEEKDAY_LABELS[date.getDay()],
      done: daysAgo >= lastDayOffset && daysAgo - lastDayOffset < Math.min(currentStreak, 7),
      isToday: daysAgo === 0,
    });
  }
  return days;
}
