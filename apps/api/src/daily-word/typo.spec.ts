import {
  SpellIndex,
  editDistance,
  fromWrongLayout,
  resolveInput,
} from '@bible-arena/shared';

/**
 * Опечатки — не редкий случай, а норма при вводе с телефона, поэтому
 * поведение здесь закреплено тестами: и то, что чинится, и — важнее — то,
 * что чиниться не должно.
 */
describe('разбор напечатанного', () => {
  const DICTIONARY = [
    'авраам',
    'моисей',
    'иерусалим',
    'женщина',
    'человек',
    'животное',
    'город',
    'предатель',
    'ковчег',
    'корабль',
  ];
  const index = new SpellIndex(DICTIONARY);
  const known = (word: string) => DICTIONARY.includes(word);
  const closest = (word: string) => index.findClosest(word);
  const resolve = (raw: string) => resolveInput(raw, known, closest);

  it('точное слово проходит без правок', () => {
    expect(resolve('Авраам')).toEqual({
      word: 'авраам',
      fix: 'none',
      original: 'Авраам',
    });
  });

  it('регистр и «ё» не считаются ошибкой', () => {
    expect(resolve('  МОИСЕЙ ')?.word).toBe('моисей');
  });

  it('чинит забытую раскладку', () => {
    // «fdhffv» на русской раскладке — это «авраам».
    const result = resolve('fdhffv');
    expect(result?.word).toBe('авраам');
    expect(result?.fix).toBe('layout');
  });

  it('чинит лишнюю букву', () => {
    const result = resolve('авраамм');
    expect(result?.word).toBe('авраам');
    expect(result?.fix).toBe('typo');
  });

  it('чинит пропущенную букву', () => {
    expect(resolve('иерусалм')?.word).toBe('иерусалим');
  });

  it('чинит переставленные соседние буквы', () => {
    expect(resolve('аврааам')?.word).toBe('авраам');
    expect(resolve('жеснщина')?.word).toBe('женщина');
  });

  it('не выдумывает слово, когда похожего нет', () => {
    expect(resolve('квазимодо')).toBeNull();
    expect(resolve('ыыыыыыы')).toBeNull();
  });

  it('не подменяет одно настоящее слово другим', () => {
    // «Корабль» и «ковчег» близки по смыслу, но не по написанию — и
    // подменять их друг другом нельзя ни при каких условиях.
    expect(resolve('корабль')?.word).toBe('корабль');
    expect(resolve('ковчег')?.word).toBe('ковчег');
  });

  it('перестановка соседних букв стоит одну правку, а не две', () => {
    expect(editDistance('авраам', 'аврааам')).toBeLessThanOrEqual(2);
    expect(editDistance('абв', 'бав')).toBe(1);
  });

  it('раскладка не трогает текст, где уже есть кириллица', () => {
    expect(fromWrongLayout('авраам')).toBeNull();
  });

  it('слишком короткий ввод не исправляется наугад', () => {
    expect(index.findClosest('аб')).toBeNull();
  });
});
