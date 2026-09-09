import {
  analyzeRoll,
  scoreSelection,
  type DiceValue,
} from '@bible-arena/shared';

/**
 * Таблица очков «Костей» — контрольный набор.
 *
 * Написан по таблице из `docs/dice.md` **до** самого подсчёта: цифры взяты
 * из задания, а не списаны с того, что вернул код. Замер, написанный после
 * того, как увидены ответы, меряет память, а не правила.
 *
 * Здесь проверяется только арифметика броска. Ход, риск и Bust — в
 * `dice-engine.spec.ts`: разделение то же, что между «сколько стоит
 * комбинация» и «что с ней делать».
 */
describe('Кости — сколько стоит комбинация', () => {
  const roll = (...values: number[]) => values as DiceValue[];
  /** Цена всего броска целиком: удобно для комбинаций из всех шести. */
  const whole = (...values: number[]) =>
    scoreSelection(roll(...values), [0, 1, 2, 3, 4, 5]);

  describe('одиночные', () => {
    it('единица — 100, пятёрка — 50', () => {
      expect(scoreSelection(roll(1, 2, 3, 4, 6, 6), [0])).toBe(100);
      expect(scoreSelection(roll(5, 2, 3, 4, 6, 6), [0])).toBe(50);
    });

    it('две единицы и пятёрка складываются', () => {
      expect(scoreSelection(roll(1, 1, 5, 2, 3, 6), [0, 1, 2])).toBe(250);
    });

    it('остальные одиночные не берутся вовсе', () => {
      for (const value of [2, 3, 4, 6]) {
        expect(scoreSelection(roll(value, 1, 2, 3, 4, 6), [0])).toBeNull();
      }
    });
  });

  describe('тройки', () => {
    // Тройка единиц выбивается из ряда: 1000, а не 100.
    const expected: Record<number, number> = {
      1: 1000,
      2: 200,
      3: 300,
      4: 400,
      5: 500,
      6: 600,
    };

    for (const [value, points] of Object.entries(expected)) {
      it(`три ${value} — ${points}`, () => {
        const v = Number(value);
        expect(scoreSelection(roll(v, v, v, 2, 3, 4), [0, 1, 2])).toBe(points);
      });
    }
  });

  describe('четыре, пять и шесть одинаковых — удвоение каждого уровня', () => {
    const table: Array<[number, number, number, number]> = [
      // значение, ×4, ×5, ×6
      [1, 2000, 4000, 8000],
      [2, 400, 800, 1600],
      [3, 600, 1200, 2400],
      [4, 800, 1600, 3200],
      [5, 1000, 2000, 4000],
      [6, 1200, 2400, 4800],
    ];

    for (const [value, four, five, six] of table) {
      it(`четыре ${value} — ${four}`, () => {
        const dice = roll(value, value, value, value, 2, 3);
        // Для двоек и троек «мусорные» кости совпали бы со значением, так
        // что для них берём заведомо чужие.
        const filler = value === 2 ? [4, 6] : value === 3 ? [4, 6] : [2, 3];
        const clean = roll(value, value, value, value, filler[0], filler[1]);
        expect(scoreSelection(clean, [0, 1, 2, 3])).toBe(four);
        expect(dice.length).toBe(6);
      });

      it(`пять ${value} — ${five}`, () => {
        const filler = value === 2 ? 4 : 2;
        const dice = roll(value, value, value, value, value, filler);
        expect(scoreSelection(dice, [0, 1, 2, 3, 4])).toBe(five);
      });

      it(`шесть ${value} — ${six}`, () => {
        expect(whole(value, value, value, value, value, value)).toBe(six);
      });
    }
  });

  describe('последовательности', () => {
    it('1-2-3-4-5 — 500', () => {
      // В том же броске лежит шестёрка, но она в выбор не входит.
      expect(scoreSelection(roll(1, 2, 3, 4, 5, 6), [0, 1, 2, 3, 4])).toBe(500);
    });

    it('2-3-4-5-6 — 750', () => {
      expect(scoreSelection(roll(2, 3, 4, 5, 6, 1), [0, 1, 2, 3, 4])).toBe(750);
    });

    it('1-2-3-4-5-6 — 1500, а не 500 плюс шестёрка', () => {
      expect(whole(1, 2, 3, 4, 5, 6)).toBe(1500);
    });

    it('порядок костей в броске не важен', () => {
      expect(whole(4, 6, 1, 3, 5, 2)).toBe(1500);
    });
  });

  describe('что очков не даёт', () => {
    it('три пары — не комбинация', () => {
      // Осознанное отличие от других вариантов Farkle, записано в ТЗ.
      expect(whole(2, 2, 3, 3, 4, 4)).toBeNull();
    });

    it('пара единиц — это две одиночные, а не «пара»', () => {
      expect(scoreSelection(roll(1, 1, 2, 3, 4, 6), [0, 1])).toBe(200);
    });

    it('пара двоек не берётся', () => {
      expect(scoreSelection(roll(2, 2, 3, 4, 6, 6), [0, 1])).toBeNull();
    });

    it('выбор с «мусорной» костью недопустим целиком', () => {
      // Единица даёт очки, тройка — нет; вместе это не половина хода, а
      // недопустимый выбор: иначе двойку можно было бы тихо пронести в
      // отложенные и обнулить следующий бросок.
      expect(scoreSelection(roll(1, 3, 2, 4, 6, 6), [0, 1])).toBeNull();
    });
  });

  describe('выбор считается по лучшей раскладке', () => {
    it('четыре пятёрки — 1000, а не тройка плюс одиночная', () => {
      expect(scoreSelection(roll(5, 5, 5, 5, 2, 3), [0, 1, 2, 3])).toBe(1000);
    });

    it('четыре единицы — 2000, а не 1000 плюс 100', () => {
      expect(scoreSelection(roll(1, 1, 1, 1, 2, 3), [0, 1, 2, 3])).toBe(2000);
    });

    it('тройка единиц и пятёрка — 1050', () => {
      expect(scoreSelection(roll(1, 1, 1, 5, 2, 3), [0, 1, 2, 3])).toBe(1050);
    });

    it('тройка двоек и две единицы — 400', () => {
      expect(scoreSelection(roll(2, 2, 2, 1, 1, 3), [0, 1, 2, 3, 4])).toBe(400);
    });
  });

  describe('разбор броска целиком', () => {
    it('без единиц, пятёрок, троек и стрита — Bust', () => {
      expect(analyzeRoll(roll(2, 2, 3, 4, 6, 6)).bust).toBe(true);
    });

    it('одна пятёрка спасает от Bust', () => {
      // Без четвёрки: иначе 2-3-4-5-6 складывается в стрит за 750, и тест
      // проверял бы не то, что задумано. _Первая же написанная проверка на
      // этом и споткнулась._
      const analysis = analyzeRoll(roll(2, 2, 3, 3, 6, 5));
      expect(analysis.bust).toBe(false);
      expect(analysis.bestScore).toBe(50);
    });

    it('в броске со стритом стрит и есть лучший вариант', () => {
      expect(analyzeRoll(roll(2, 2, 3, 4, 6, 5)).bestScore).toBe(750);
    });

    it('лучший вариант считается по всему броску', () => {
      // 1-1-1-5 = 1050; взять только тройку (1000) хуже.
      expect(analyzeRoll(roll(1, 1, 1, 5, 2, 3)).bestScore).toBe(1050);
    });

    it('полный стрит даёт 1500 и забирает все шесть', () => {
      const analysis = analyzeRoll(roll(1, 2, 3, 4, 5, 6));
      expect(analysis.bestScore).toBe(1500);
      expect(analysis.bestIndexes).toHaveLength(6);
    });

    it('у Bust лучший вариант — ноль и пустой выбор', () => {
      const analysis = analyzeRoll(roll(3, 3, 4, 4, 6, 2));
      expect(analysis.bestScore).toBe(0);
      expect(analysis.bestIndexes).toEqual([]);
    });

    it('bust на трёх костях считается по тем же правилам', () => {
      expect(analyzeRoll(roll(2, 3, 4)).bust).toBe(true);
      expect(analyzeRoll(roll(2, 3, 5)).bust).toBe(false);
    });
  });

  describe('границы выбора', () => {
    it('пустой выбор ничего не стоит', () => {
      expect(scoreSelection(roll(1, 2, 3, 4, 5, 6), [])).toBeNull();
    });

    it('несуществующая кость отвергается', () => {
      // Клиент прислал индекс за пределами броска — самый простой способ
      // проверить, что сервер не верит присланному на слово.
      expect(scoreSelection(roll(1, 2, 3), [0, 7])).toBeNull();
      expect(scoreSelection(roll(1, 2, 3), [-1])).toBeNull();
    });

    it('одна кость дважды не считается', () => {
      expect(scoreSelection(roll(1, 2, 3, 4, 6, 6), [0, 0])).toBeNull();
    });
  });
});
