import { RELATED, UNRELATED, type Pair } from './benchmark-pairs';
import { KNOWN_LINKS } from './known-links';
import { SemanticsService } from './semantics.service';

/**
 * Замер расстояний, закреплённый как проверка.
 *
 * Отдельные примеры показывают, что где-то хорошо; эта проверка следит за
 * тем, чтобы хорошо было в целом — и чтобы это нельзя было испортить
 * незаметно. Пороги стоят с запасом от измеренного: они ловят обвал, а не
 * колебание в несколько мест.
 *
 * Считаются только пары, связь которых **не** выписана руками в
 * `known-links.ts`. Иначе проверка обманывает себя: увидев промах, легко
 * вписать связь и получить зелёное, ничего не улучшив. Выписанные связи —
 * это заплатки на конкретные слова, и мерить ими качество мер нельзя.
 *
 * Подробный разбор по областям и список худших случаев печатает
 * `pnpm --filter @bible-arena/api semantics:report`.
 */
describe('расстояния в целом', () => {
  const service = new SemanticsService();
  const cache = new Map<number, ReturnType<SemanticsService['rank']>>();

  beforeAll(() => {
    service.onModuleInit();
  });

  /** Места всех пар списка; `null` — если слова нет в словаре. */
  const ranksOf = (list: Pair[]): (number | null)[] =>
    list.map(({ secret, guess }) => {
      const s = service.lookup(secret);
      const g = service.lookup(guess);
      if (s === null || g === null) return null;
      let ranking = cache.get(s);
      if (!ranking) {
        ranking = service.rank(s);
        cache.set(s, ranking);
      }
      return ranking.rankOf(g);
    });

  /** Пары, о которых меры догадываются сами, без выписанной подсказки. */
  const related = () =>
    Object.values(RELATED)
      .flat()
      .filter(
        ({ secret, guess }) =>
          !(KNOWN_LINKS[secret] ?? []).includes(guess) &&
          !(KNOWN_LINKS[guess] ?? []).includes(secret),
      );

  it('знает все слова набора', () => {
    const unknown = [...Object.values(RELATED).flat(), ...UNRELATED].filter(
      ({ secret, guess }) =>
        service.lookup(secret) === null || service.lookup(guess) === null,
    );
    // Слово, которого нет в словаре, — это не «далеко», а «игра тебя не
    // поняла». Для обычной русской лексики такого быть не должно.
    expect(unknown).toEqual([]);
  });

  it('держит связанные слова близко', () => {
    const ranks = ranksOf(related()).filter((r): r is number => r !== null);
    const sorted = [...ranks].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const hot = ranks.filter((r) => r <= 300).length / ranks.length;
    const warm = ranks.filter((r) => r <= 2000).length / ranks.length;

    expect(median).toBeLessThanOrEqual(45);
    expect(hot).toBeGreaterThanOrEqual(0.9);
    expect(warm).toBeGreaterThanOrEqual(0.99);
  });

  it('оставляет посторонние слова далеко', () => {
    const ranks = ranksOf(UNRELATED).filter((r): r is number => r !== null);
    const sorted = [...ranks].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const far = ranks.filter((r) => r > 10_000).length / ranks.length;

    // Половина оценки — здесь: система, которая всех подтягивает друг к
    // другу, выглядит умной ровно до этой проверки.
    expect(median).toBeGreaterThanOrEqual(15_000);
    expect(far).toBeGreaterThanOrEqual(0.9);
  });
});
