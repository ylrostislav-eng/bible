import {
  HOT_COLD_HINT_FLOOR,
  hotColdAttemptsLabel,
  hotColdBand,
  hotColdHeat,
  hotColdReward,
  hotColdShareText,
} from '@bible-arena/shared';
import { SemanticsService } from '../semantics/semantics.service';

describe('правила «Горячо-холодно»', () => {
  it('ступень тепла по месту', () => {
    expect(hotColdBand(1)).toBe('FOUND');
    expect(hotColdBand(2)).toBe('HOT');
    expect(hotColdBand(300)).toBe('HOT');
    expect(hotColdBand(301)).toBe('WARM');
    expect(hotColdBand(2000)).toBe('WARM');
    expect(hotColdBand(2001)).toBe('COLD');
    expect(hotColdBand(10_000)).toBe('COLD');
    expect(hotColdBand(10_001)).toBe('ICE');
  });

  it('полоска заполняется тем сильнее, чем ближе', () => {
    expect(hotColdHeat(1)).toBe(1);
    // Шкала логарифмическая: между сотым и двухсотым местом для игрока
    // пропасть, между двадцатитысячным и двадцать первым — ничего.
    expect(hotColdHeat(100)).toBeGreaterThan(hotColdHeat(200));
    expect(hotColdHeat(20_000) - hotColdHeat(20_100)).toBeLessThan(
      hotColdHeat(100) - hotColdHeat(200),
    );
    expect(hotColdHeat(50_000)).toBeGreaterThanOrEqual(0);
  });

  it('награда падает с числом попыток и подсказок', () => {
    expect(hotColdReward(5, 0).xp).toBeGreaterThan(hotColdReward(30, 0).xp);
    expect(hotColdReward(30, 0).xp).toBeGreaterThan(hotColdReward(300, 0).xp);
    expect(hotColdReward(5, 1).xp).toBeLessThan(hotColdReward(5, 0).xp);
    // Совсем без награды не остаётся никто: доиграл — получил.
    expect(hotColdReward(1000, 3).xp).toBeGreaterThanOrEqual(1);
  });

  it('склоняет попытки по-русски', () => {
    expect(hotColdAttemptsLabel(1)).toBe('1 попытка');
    expect(hotColdAttemptsLabel(3)).toBe('3 попытки');
    expect(hotColdAttemptsLabel(11)).toBe('11 попыток');
    expect(hotColdAttemptsLabel(21)).toBe('21 попытка');
    expect(hotColdAttemptsLabel(25)).toBe('25 попыток');
  });

  it('строка для друзей не выдаёт слова', () => {
    const text = hotColdShareText({
      solved: true,
      guessCount: 12,
      hintsUsed: 1,
    });
    expect(text).toContain('12 попыток');
    expect(text).toContain('подсказок 1');
  });
});

describe('подсказка', () => {
  const service = new SemanticsService();

  beforeAll(() => {
    service.onModuleInit();
  });

  it('открывает слово ближе названного и не повторяет уже названное', () => {
    const secret = service.lookup('ковчег');
    expect(secret).not.toBeNull();
    const ranking = service.rank(secret as number);

    const first = ranking.wordAt(50, new Set());
    expect(first).not.toBeNull();
    expect(first!.rank).toBeLessThanOrEqual(50);

    // Уже названное слово подсказкой не выдаётся — иначе подсказка
    // потратилась бы впустую.
    const again = ranking.wordAt(50, new Set([first!.word]));
    expect(again!.word).not.toBe(first!.word);
  });

  it('никогда не выдаёт само загаданное слово', () => {
    const secret = service.lookup('давид');
    const ranking = service.rank(secret as number);
    const hint = ranking.wordAt(HOT_COLD_HINT_FLOOR, new Set());
    expect(hint!.rank).toBeGreaterThan(1);
    expect(hint!.word).not.toBe('давид');
  });
});
