import {
  HOT_COLD_DUEL_HINTS,
  HOT_COLD_DUEL_LOSER_SHARE,
  HOT_COLD_DUEL_LOSS_RATING,
  HOT_COLD_DUEL_MAX_GUESSES,
  HOT_COLD_DUEL_POINTS_SHARE,
  HOT_COLD_DUEL_WIN_RATING,
  hotColdDuelFullPoints,
  hotColdDuelOutcomeLabel,
  type HotColdDuelState,
  HOT_COLD_FREE_REWARD_SHARE,
  HOT_COLD_FREE_XP_PER_DAY,
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

describe('свободные партии', () => {
  it('дают заметно меньше слова дня', () => {
    // Иначе вечер свободных партий стоил бы больше месяца ежедневной игры,
    // и слово дня перестало бы что-либо значить.
    expect(HOT_COLD_FREE_REWARD_SHARE).toBeGreaterThan(0);
    expect(HOT_COLD_FREE_REWARD_SHARE).toBeLessThan(0.5);
  });

  it('дневной потолок сопоставим с одним словом дня', () => {
    // Не «сколько угодно опыта»: у долгой игры должен быть предел, иначе
    // доля от чего-то, повторённого двести раз, всё равно много. И не
    // «крохи»: за вечер должно набегать примерно как за одно слово дня,
    // угаданное хорошо, — 60 XP.
    const best = hotColdReward(1, 0).xp;
    expect(HOT_COLD_FREE_XP_PER_DAY).toBeGreaterThanOrEqual(best / 2);
    expect(HOT_COLD_FREE_XP_PER_DAY).toBeLessThanOrEqual(best * 2);
  });

  it('потолок достигается не с первой партии', () => {
    // Если бы одна свободная партия выбирала весь дневной остаток, потолок
    // был бы неотличим от «одна свободная партия в день».
    const perGame = Math.round(
      hotColdReward(1, 0).xp * HOT_COLD_FREE_REWARD_SHARE,
    );
    expect(HOT_COLD_FREE_XP_PER_DAY / perGame).toBeGreaterThanOrEqual(2);
  });
});

describe('правила дуэли', () => {
  /** Заготовка состояния: в тестах меняется только то, что проверяется. */
  const duel = (patch: Partial<HotColdDuelState>): HotColdDuelState => ({
    id: 'd1',
    status: 'FINISHED',
    inviteCode: 'ABC123',
    vocabulary: 50_000,
    guesses: [],
    bestRank: null,
    guessesLeft: HOT_COLD_DUEL_MAX_GUESSES,
    deadlineAt: null,
    serverNow: new Date().toISOString(),
    solved: false,
    surrendered: false,
    opponent: null,
    canClaimWin: false,
    winnerId: null,
    word: null,
    gloss: null,
    reward: null,
    ...patch,
  });

  it('победа стоит дороже поражения, и поражение не бесплатно', () => {
    expect(HOT_COLD_DUEL_WIN_RATING).toBeGreaterThan(0);
    expect(HOT_COLD_DUEL_LOSS_RATING).toBeLessThan(0);
    // Проигравший играл и думал — совсем ни с чем он не уходит.
    expect(HOT_COLD_DUEL_LOSER_SHARE).toBeGreaterThan(0);
    // Но если платить поровну, исход перестаёт что-либо значить.
    expect(HOT_COLD_DUEL_LOSER_SHARE).toBeLessThan(0.5);
  });

  it('подсказок в дуэли нет', () => {
    // Не забывчивость: в гонке подсказка приближает к ответу быстрее
    // любого хода, а платит за неё проигравший. Брать её было бы
    // обязательно, то есть это не выбор, а лишнее нажатие.
    expect(HOT_COLD_DUEL_HINTS).toBe(0);
  });

  /** Соперник в состоянии — с полями, которые различают исходы. */
  const rival = (
    patch: Partial<NonNullable<HotColdDuelState['opponent']>>,
  ) => ({
    userId: 'u2',
    nickname: 'соперник',
    avatarUrl: null,
    ranks: [],
    bestRank: null,
    guessCount: 0,
    guessesLeft: HOT_COLD_DUEL_MAX_GUESSES,
    solved: false,
    surrendered: false,
    online: true,
    ...patch,
  });

  it('каждый из пяти исходов называется своим именем', () => {
    const me = 'u1';
    // Партию можно закончить пятью разными способами, и человек должен
    // понимать, который случился с ним: «вы проиграли» после того, как
    // соперник просто ушёл, — неправда, за которую обидно.
    expect(
      hotColdDuelOutcomeLabel(duel({ winnerId: me, solved: true }), me),
    ).toBe('Вы нашли первым');
    expect(
      hotColdDuelOutcomeLabel(
        duel({ winnerId: me, opponent: rival({ surrendered: true }) }),
        me,
      ),
    ).toBe('Соперник сдался');
    // Победа есть, но слово нашёл не я и соперник не сдавался — значит,
    // он ушёл и не вернулся.
    expect(
      hotColdDuelOutcomeLabel(duel({ winnerId: me, opponent: rival({}) }), me),
    ).toBe('Соперник не вернулся — победа ваша');
    expect(
      hotColdDuelOutcomeLabel(
        duel({ winnerId: 'u2', opponent: rival({ solved: true }) }),
        me,
      ),
    ).toBe('Соперник нашёл первым');
    expect(
      hotColdDuelOutcomeLabel(duel({ winnerId: 'u2', surrendered: true }), me),
    ).toBe('Вы сдались');
  });

  it('слово не нашлось — победа по очкам, вдвое дешевле', () => {
    // Одно правило на три случая: кончились слова, соперник сдался,
    // соперник ушёл. Во всех трёх слово осталось неразгаданным.
    expect(HOT_COLD_DUEL_POINTS_SHARE).toBe(0.5);
    const me = 'u1';
    expect(hotColdDuelFullPoints(duel({ solved: true }))).toBe(true);
    expect(
      hotColdDuelFullPoints(duel({ opponent: rival({ solved: true }) })),
    ).toBe(true);
    expect(hotColdDuelFullPoints(duel({ winnerId: me }))).toBe(false);
  });

  it('кончившиеся слова названы своим исходом', () => {
    const me = 'u1';
    expect(
      hotColdDuelOutcomeLabel(duel({ winnerId: me, guessesLeft: 0 }), me),
    ).toBe('Слов не осталось — вы были ближе');
    expect(
      hotColdDuelOutcomeLabel(duel({ winnerId: 'u2', guessesLeft: 0 }), me),
    ).toBe('Слов не осталось — соперник был ближе');
  });

  it('ничья — это законченная партия без победителя', () => {
    const me = 'u1';
    // Так кончается брошенная обоими партия, где никто не подошёл ближе.
    // Отличать её от идущей надо по статусу, а не по пустому winnerId.
    expect(
      hotColdDuelOutcomeLabel(duel({ status: 'FINISHED', winnerId: null }), me),
    ).toBe('Ничья: подошли одинаково близко');
    expect(
      hotColdDuelOutcomeLabel(
        duel({ status: 'IN_PROGRESS', winnerId: null }),
        me,
      ),
    ).toBe('');
    expect(hotColdDuelOutcomeLabel(duel({ status: 'ABANDONED' }), me)).toBe(
      'Дуэль не состоялась',
    );
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
