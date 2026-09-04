import { dailyWordIndex } from './daily-word.service';

/**
 * Про выбор слова дня в комментарии сказано «520 слов — 520 дней без
 * единого повтора». Это ровно то обещание, нарушение которого заметили бы
 * только через год игры, поэтому оно проверяется здесь, а не на глаз.
 */
describe('dailyWordIndex', () => {
  const BANK = 520;
  const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000);

  it('за длину банка не повторяет ни одного слова', () => {
    const seen = new Set<number>();
    for (let i = 0; i < BANK; i += 1) seen.add(dailyWordIndex(day(i), BANK));
    expect(seen.size).toBe(BANK);
  });

  it('повторяет цикл ровно через длину банка', () => {
    expect(dailyWordIndex(day(BANK), BANK)).toBe(dailyWordIndex(day(0), BANK));
  });

  it('в один и тот же день даёт один и тот же ответ', () => {
    expect(dailyWordIndex(day(7), BANK)).toBe(dailyWordIndex(day(7), BANK));
  });

  it('соседние дни всегда разные', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(dailyWordIndex(day(i), BANK)).not.toBe(
        dailyWordIndex(day(i + 1), BANK),
      );
    }
  });

  it('не выходит за границы даже на банке из одного слова', () => {
    expect(dailyWordIndex(day(5), 1)).toBe(0);
  });

  it('не даёт отрицательный индекс на датах до 1970 года', () => {
    const index = dailyWordIndex(new Date(Date.UTC(1969, 0, 1)), BANK);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(BANK);
  });
});
