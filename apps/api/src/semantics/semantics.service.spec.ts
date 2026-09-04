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

  /**
   * То, ради чего появилась связанность.
   *
   * По одной похожести «потоп» стоял на 821 месте от «ковчега»: слова
   * непохожи — предмет и событие. Для человека это одна история, и
   * расстояние обязано это отражать. Проверяем не только порядок, но и
   * порядок величины: связанное должно быть в первых сотнях, а не в
   * первых тысячах, иначе игрок не поймёт, что мыслил верно.
   */
  it('держит рядом то, что связано сюжетом, а не похоже', () => {
    expect(place('ковчег', 'потоп')).toBeLessThan(100);
    expect(place('ковчег', 'ной')).toBeLessThan(100);
    expect(place('ковчег', 'вода')).toBeLessThan(1000);

    expect(place('давид', 'саул')).toBeLessThan(100);
    expect(place('давид', 'псалом')).toBeLessThan(100);
    expect(place('давид', 'голиаф')).toBeLessThan(1000);

    expect(place('иуда', 'поцелуй')).toBeLessThan(1000);
    expect(place('иуда', 'предатель')).toBeLessThan(1000);
  });

  /**
   * Игра не про Библию одна: игрок пишет что угодно, и расстояние должно
   * быть внятным и там. Проверяем на словах, которых в Писании нет вовсе.
   */
  it('так же уверенно меряет обычные слова', () => {
    expect(place('врач', 'пациент')).toBeLessThan(100);
    expect(place('врач', 'больница')).toBeLessThan(100);
    expect(place('врач', 'футбол')).toBeGreaterThan(5000);

    expect(place('хлеб', 'масло')).toBeLessThan(100);
    // Нож с хлебом не схож ничем — только тем, что им хлеб режут.
    expect(place('хлеб', 'нож')).toBeLessThan(1000);

    expect(place('собака', 'кошка')).toBeLessThan(100);
    expect(place('собака', 'поводок')).toBeLessThan(100);
    expect(place('собака', 'кость')).toBeLessThan(1000);

    expect(place('дождь', 'туча')).toBeLessThan(100);
    expect(place('дождь', 'зонт')).toBeLessThan(100);

    expect(place('школа', 'ученик')).toBeLessThan(100);
    expect(place('кофе', 'чашка')).toBeLessThan(100);
  });

  it('не подтягивает постороннее за компанию', () => {
    // «Стул» не встречается в Писании вовсе и не должен получать место
    // ближе, чем ему полагается по смыслу.
    expect(place('ковчег', 'стул')).toBeGreaterThan(5000);
    expect(place('давид', 'стул')).toBeGreaterThan(5000);
    expect(place('милосердие', 'стул')).toBeGreaterThan(5000);
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
