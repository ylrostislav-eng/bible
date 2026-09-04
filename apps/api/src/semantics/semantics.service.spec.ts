import { SemanticsService } from './semantics.service';

/**
 * Проверка не кода, а словаря.
 *
 * Обычный тест ловит поломку в логике; здесь важнее другое — что близость
 * между словами осталась осмысленной. Словарь собирается скриптом из
 * внешнего источника, и если однажды пересобрать его иначе, эти проверки
 * должны заметить, что «стул» вдруг оказался ближе к Аврааму, чем «Исаак».
 *
 * Поэтому все ожидания сформулированы как порядок, а не как числа: точное
 * место слова зависит от размера словаря и меняться вправе, а вот кто
 * ближе кого — нет.
 */
describe('SemanticsService', () => {
  const service = new SemanticsService();

  beforeAll(() => {
    service.onModuleInit();
  });

  it('загружает словарь', () => {
    expect(service.problem).toBeNull();
    expect(service.ready).toBe(true);
  });

  /** Место слова в списке близости к загаданному. */
  const place = (secret: string, guess: string): number => {
    const secretIndex = service.lookup(secret);
    const guessIndex = service.lookup(guess);
    if (secretIndex === null) throw new Error(`нет в словаре: ${secret}`);
    if (guessIndex === null) throw new Error(`нет в словаре: ${guess}`);
    return service.rank(secretIndex).rankOf(guessIndex);
  };

  it('загаданное слово стоит первым', () => {
    expect(place('ковчег', 'ковчег')).toBe(1);
  });

  it('понимает падежные формы', () => {
    expect(service.lookup('ковчега')).toBe(service.lookup('ковчег'));
    expect(service.lookup('человеку')).toBe(service.lookup('человек'));
    expect(service.lookup('иерусалиме')).toBe(service.lookup('иерусалим'));
  });

  it('ставит связанное ближе постороннего', () => {
    // Ной и потоп — про ковчег; стул не про него никак.
    expect(place('ковчег', 'ной')).toBeLessThan(place('ковчег', 'вода'));
    expect(place('ковчег', 'вода')).toBeLessThan(place('ковчег', 'стул'));

    expect(place('авраам', 'исаак')).toBeLessThan(place('авраам', 'город'));
    expect(place('авраам', 'город')).toBeLessThan(place('авраам', 'компьютер'));

    expect(place('иерусалим', 'храм')).toBeLessThan(place('иерусалим', 'стул'));
  });

  it('различает оттенки внутри одной темы', () => {
    // Милость и доброта — почти то же самое, суд — уже другое,
    // а камень к милосердию отношения не имеет.
    expect(place('милосердие', 'милость')).toBeLessThan(
      place('милосердие', 'суд'),
    );
    expect(place('милосердие', 'суд')).toBeLessThan(
      place('милосердие', 'камень'),
    );
  });

  it('чинит раскладку и опечатки, но не выдумывает слов', () => {
    // «fdhffv» на русской раскладке — «авраам».
    expect(service.resolve('fdhffv')?.word).toBe('авраам');
    expect(service.resolve('аврам')?.word).toBe('аврам');
    expect(service.resolve('ковчегг')).toMatchObject({
      word: 'ковчег',
      fix: 'typo',
    });
    // Набор букв не должен превращаться в случайное слово.
    expect(service.resolve('щщщщщщщщ')).toBeNull();
  });

  it('называет ближайших соседей', () => {
    const secret = service.lookup('пастух');
    expect(secret).not.toBeNull();
    const neighbours = service.rank(secret as number).closest(5);
    expect(neighbours).toHaveLength(5);
    // Само загаданное слово в соседи не попадает.
    expect(neighbours.map((n) => n.word)).not.toContain('пастух');
    expect(neighbours[0].rank).toBe(2);
  });
});
