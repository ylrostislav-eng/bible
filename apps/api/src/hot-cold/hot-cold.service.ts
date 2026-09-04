import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  HOT_COLD_HINT_DIVISOR,
  HOT_COLD_FEEDBACK_LIMIT,
  HOT_COLD_HINT_COMMON_LIMIT,
  HOT_COLD_HINT_FIRST,
  HOT_COLD_HINT_FLOOR,
  HOT_COLD_SECRET_COMMON_LIMIT,
  HOT_COLD_SECRET_MIN_EPISODES,
  HOT_COLD_DAILY_ROUND,
  HOT_COLD_HINT_PROMISE,
  hotColdHintKind,
  type HotColdHintKind,
  HOT_COLD_FREE_REWARD_SHARE,
  HOT_COLD_FREE_XP_PER_DAY,
  hotColdReward,
  type HotColdGuess,
  type HotColdGuessResult,
  type HotColdState,
} from '@bible-arena/shared';
import {
  dateLabel,
  dayIndex,
  localDate,
  shuffledByKey,
} from '../common/local-day';
import { PrismaService } from '../prisma/prisma.service';
import {
  SemanticsService,
  type SemanticRanking,
} from '../semantics/semantics.service';
import { UsersService } from '../users/users.service';

/**
 * «Горячо-холодно»: угадать слово дня, идя на тепло.
 *
 * Игрок пишет любое русское слово, игра отвечает его местом по близости к
 * загаданному. Попытки не ограничены — «проиграть» здесь нельзя, можно
 * только не доиграть, и счётом служит число попыток.
 *
 * Всё, чем игра думает, лежит в `SemanticsService`; здесь — только день,
 * ход партии и награда.
 */

/** Сколько ближайших слов показать в разборе после игры. */
const CLOSEST_SHOWN = 10;

/**
 * Ранжирование словаря стоит около двухсот миллисекунд, а слово дня одно на
 * всех. Считаем его один раз и держим, пока живёт процесс: два дня подряд —
 * это две записи, а не двести.
 */
const RANKING_CACHE_LIMIT = 4;

interface WordRow {
  id: string;
  word: string;
  gloss: string;
}

interface AttemptRow {
  id: string;
  round: number;
  guesses: unknown;
  hints: unknown;
  gaveUp: boolean;
  guessCount: number;
  hintsUsed: number;
  solved: boolean;
  finishedAt: Date | null;
  xpEarned: number;
  coinsEarned: number;
  word: WordRow;
}

@Injectable()
export class HotColdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly semantics: SemanticsService,
  ) {}

  private readonly rankings = new Map<string, SemanticRanking>();

  // ---- какое слово сегодня ----

  /**
   * Слово дня.
   *
   * Годится не всякое слово банка. Во-первых, оно должно быть в словаре
   * смыслов: загадать то, чему игра не умеет считать расстояние, значит
   * обречь игрока на бессмысленные числа. Во-вторых, его должно быть
   * реально возможно назвать — либо это обиходное русское слово, либо оно
   * часто встречается в Писании. Живая проверка выдала словом дня
   * «зилота»: и не назовёшь, и связей вокруг почти нет.
   *
   * Из 520 слов Alias проходят 259 — это двести пятьдесят девять дней без
   * повтора.
   */
  private async usableWords(): Promise<WordRow[]> {
    const words = await this.prisma.aliasWord.findMany({
      select: { id: true, word: true, gloss: true },
    });
    const usable = words.filter((row) => {
      const lemma = this.semantics.lookup(row.word);
      if (lemma === null) return false;
      return (
        lemma < HOT_COLD_SECRET_COMMON_LIMIT ||
        this.semantics.episodesFor(lemma) >= HOT_COLD_SECRET_MIN_EPISODES
      );
    });
    if (usable.length === 0) {
      throw new BadRequestException(
        this.semantics.ready
          ? 'В банке нет слов, которые годятся для этой игры'
          : 'Словарь смыслов не загружен — игра недоступна',
      );
    }
    return usable;
  }

  private async pickWordFor(date: Date): Promise<WordRow> {
    const usable = await this.usableWords();
    const ordered = shuffledByKey(usable, (row) => row.id);
    return ordered[dayIndex(date, ordered.length)];
  }

  /**
   * Слово для свободной партии.
   *
   * Порядок свой у каждого игрока и на каждый день: перестановка считается
   * от связки «кто, когда, какое слово». Общий порядок здесь был бы хуже —
   * двое сидящих рядом получали бы одно и то же, и вторая партия
   * превращалась бы в подглядывание.
   *
   * Уже сыгранные сегодня слова пропускаются, включая слово дня: получить
   * его второй раз, уже зная ответ, — не партия. Слов проходит 259, так
   * что «кончились» — случай теоретический, но обработан: там честное
   * сообщение, а не пустой экран.
   */
  private async pickFreeWord(
    userId: string,
    date: Date,
    used: Set<string>,
  ): Promise<WordRow> {
    const usable = await this.usableWords();
    const ordered = shuffledByKey(
      usable,
      (row) => `${userId}:${dateLabel(date)}:${row.id}`,
    );
    const next = ordered.find((row) => !used.has(row.id));
    if (!next) {
      throw new BadRequestException(
        'Слова на сегодня кончились — все сыграны. Возвращайтесь завтра.',
      );
    }
    return next;
  }

  /** Отранжированный словарь для загаданного слова. */
  private rankingFor(word: WordRow): SemanticRanking {
    const cached = this.rankings.get(word.id);
    if (cached) return cached;

    const lemma = this.semantics.lookup(word.word);
    if (lemma === null) {
      throw new BadRequestException('Игра не знает загаданного слова');
    }
    const ranking = this.semantics.rank(lemma);
    // Простое вытеснение по возрасту: записей всё равно единицы, а `Map`
    // хранит ключи в порядке добавления, так что первый и есть старейший.
    if (this.rankings.size >= RANKING_CACHE_LIMIT) {
      for (const oldest of this.rankings.keys()) {
        this.rankings.delete(oldest);
        break;
      }
    }
    this.rankings.set(word.id, ranking);
    return ranking;
  }

  // ---- состояние дня ----

  /**
   * Партия, в которую игрок вернётся, открыв экран.
   *
   * Последняя начатая, а не слово дня: человек, бросивший третью свободную
   * партию на середине, ждёт увидеть именно её. Слово дня при этом никуда
   * не девается — его можно открыть по номеру.
   */
  private async loadOrCreateAttempt(
    userId: string,
    timezoneOffsetMinutes: number,
    round?: number,
  ) {
    const date = localDate(timezoneOffsetMinutes);
    if (round === undefined) {
      const latest = await this.prisma.hotColdAttempt.findFirst({
        where: { userId, date },
        orderBy: { round: 'desc' },
        include: { word: true },
      });
      if (latest) return { attempt: latest, date };
    } else {
      const existing = await this.prisma.hotColdAttempt.findUnique({
        where: { userId_date_round: { userId, date, round } },
        include: { word: true },
      });
      if (existing) return { attempt: existing, date };
      if (round !== HOT_COLD_DAILY_ROUND) {
        // Свободные партии заводит только «Ещё слово»: создавать их по
        // номеру из запроса значило бы позволить клиенту перескочить через
        // десяток и получить слово, до которого он не доиграл.
        throw new BadRequestException('Такой партии не было');
      }
    }

    const word = await this.pickWordFor(date);
    // `upsert`, а не `create`: два запроса подряд с одного устройства —
    // обычное дело при быстром открытии экрана, и второй не должен падать
    // на уникальном индексе.
    const attempt = await this.prisma.hotColdAttempt.upsert({
      where: {
        userId_date_round: { userId, date, round: HOT_COLD_DAILY_ROUND },
      },
      create: { userId, date, round: HOT_COLD_DAILY_ROUND, wordId: word.id },
      update: {},
      include: { word: true },
    });
    return { attempt, date };
  }

  /** Сколько опыта свободные партии сегодня уже принесли. */
  private async freeXpSpent(userId: string, date: Date): Promise<number> {
    const spent = await this.prisma.hotColdAttempt.aggregate({
      where: { userId, date, round: { gt: HOT_COLD_DAILY_ROUND } },
      _sum: { xpEarned: true },
    });
    return spent._sum.xpEarned ?? 0;
  }

  async getState(
    userId: string,
    timezoneOffsetMinutes: number,
    round?: number,
  ): Promise<HotColdState> {
    const { attempt, date } = await this.loadOrCreateAttempt(
      userId,
      timezoneOffsetMinutes,
      round,
    );
    return this.toState(attempt, date, await this.freeXpSpent(userId, date));
  }

  /**
   * Следующая свободная партия — то самое «ещё одну».
   *
   * Раньше игра кончалась на угаданном слове дня, и это была её главная
   * дыра: в такие игры возвращаются именно за «ещё одну», а сказать это
   * было некому. Слово дня при этом остаётся одним на всех и своей
   * ценности не теряет — свободные партии идут отдельным счётом и дают
   * заметно меньше.
   */
  async startNextRound(
    userId: string,
    timezoneOffsetMinutes: number,
  ): Promise<HotColdState> {
    const date = localDate(timezoneOffsetMinutes);
    const played = await this.prisma.hotColdAttempt.findMany({
      where: { userId, date },
      select: { round: true, wordId: true, finishedAt: true },
      orderBy: { round: 'desc' },
    });
    const current = played[0];
    if (current && current.finishedAt === null) {
      // Недоигранную партию новая не отменяет: иначе «ещё слово», нажатое
      // случайно, стирало бы полчаса работы.
      throw new BadRequestException(
        'Сначала доиграйте текущее слово — или откройте его и угадайте',
      );
    }

    const round = (current?.round ?? HOT_COLD_DAILY_ROUND) + 1;
    const word = await this.pickFreeWord(
      userId,
      date,
      new Set(played.map((row) => row.wordId)),
    );
    const attempt = await this.prisma.hotColdAttempt.upsert({
      where: { userId_date_round: { userId, date, round } },
      create: { userId, date, round, wordId: word.id },
      update: {},
      include: { word: true },
    });
    return this.toState(attempt, date, await this.freeXpSpent(userId, date));
  }

  private toState(
    attempt: AttemptRow,
    date: Date,
    freeXpSpent: number,
  ): HotColdState {
    const finished = attempt.finishedAt !== null;
    const guesses = readGuesses(attempt.guesses);
    const ranking = finished ? this.rankingFor(attempt.word) : null;

    const free = attempt.round !== HOT_COLD_DAILY_ROUND;
    const freeXpLeft = Math.max(0, HOT_COLD_FREE_XP_PER_DAY - freeXpSpent);

    return {
      date: dateLabel(date),
      round: attempt.round,
      free,
      freeXpLeft,
      // Ближайшая догадка сверху: список читается как «насколько я близко»,
      // а не как история ходов, и порядок появления здесь ничего не значит.
      guesses: [...guesses].sort((a, b) => a.rank - b.rank),
      vocabulary: this.semantics.size,
      hintsUsed: attempt.hintsUsed,
      nextHint: finished
        ? null
        : (() => {
            const kind = hotColdHintKind(attempt.hintsUsed);
            return { kind, promise: HOT_COLD_HINT_PROMISE[kind] };
          })(),
      hints: readHints(attempt.hints),
      gaveUp: attempt.gaveUp,
      disputesLeft: Math.max(
        0,
        HOT_COLD_FEEDBACK_LIMIT -
          guesses.filter((entry) => entry.disputed).length,
      ),
      solved: attempt.solved,
      finished,
      rewardIfSolvedNow: capFreeReward(
        hotColdReward(attempt.guessCount + 1, attempt.hintsUsed),
        free,
        freeXpLeft,
      ),
      // Ответ уезжает клиенту только после конца игры: иначе он приезжал бы
      // в самом первом запросе, и вся игра сводилась бы к открытой вкладке
      // разработчика.
      word: finished ? attempt.word.word : null,
      gloss: finished ? attempt.word.gloss : null,
      closest: ranking
        ? ranking.closest(CLOSEST_SHOWN).map((near) => ({
            word: near.word,
            rank: near.rank,
          }))
        : null,
      earned: attempt.solved
        ? { xp: attempt.xpEarned, coins: attempt.coinsEarned }
        : null,
    };
  }

  // ---- ход игры ----

  async guess(
    userId: string,
    timezoneOffsetMinutes: number,
    rawGuess: string,
    round?: number,
  ): Promise<HotColdGuessResult> {
    const trimmed = rawGuess.trim();
    if (trimmed.length === 0) throw new BadRequestException('Пустой ответ');

    const { attempt, date } = await this.loadOrCreateAttempt(
      userId,
      timezoneOffsetMinutes,
      round,
    );
    if (attempt.finishedAt) {
      throw new BadRequestException('Это слово уже угадано');
    }
    const freeXpSpent = await this.freeXpSpent(userId, date);

    const resolved = this.semantics.resolve(trimmed);
    if (!resolved) {
      // Честное «не знаю такого слова» — и оно не стоит попытки: наказывать
      // за то, что словарь чего-то не содержит, было бы нечестно.
      return {
        state: this.toState(attempt, date, freeXpSpent),
        rank: null,
        fix: 'none',
        understood: null,
        repeat: false,
      };
    }

    const guesses = readGuesses(attempt.guesses);
    const already = guesses.find((entry) => entry.word === resolved.word);
    if (already) {
      // Повтор тоже не стоит попытки: чаще всего это опечатка, приведшая к
      // тому же слову, а не попытка обмануть счёт.
      return {
        state: this.toState(attempt, date, freeXpSpent),
        rank: already.rank,
        fix: resolved.fix,
        understood: resolved.fix === 'none' ? null : resolved.word,
        repeat: true,
      };
    }

    const ranking = this.rankingFor(attempt.word);
    const rank = ranking.rankOf(resolved.lemma);
    const solved = rank === 1;
    const guessCount = attempt.guessCount + 1;
    const reward = capFreeReward(
      hotColdReward(guessCount, attempt.hintsUsed),
      attempt.round !== HOT_COLD_DAILY_ROUND,
      Math.max(0, HOT_COLD_FREE_XP_PER_DAY - freeXpSpent),
    );

    // Одна запись на весь исход: `updateMany` с условием «ещё не закончено»
    // отсекает второй одновременный ответ, который иначе начислил бы
    // награду дважды.
    const claimed = await this.prisma.hotColdAttempt.updateMany({
      where: { id: attempt.id, finishedAt: null },
      data: {
        guesses: writeGuesses([...guesses, { word: resolved.word, rank }]),
        guessCount,
        solved,
        finishedAt: solved ? new Date() : null,
        xpEarned: solved ? reward.xp : 0,
        coinsEarned: solved ? reward.coins : 0,
      },
    });

    if (solved && claimed.count > 0 && (reward.xp > 0 || reward.coins > 0)) {
      // Награда и серия дней — общим путём со всеми режимами, чтобы игра
      // двигала серию так же, как сыгранная партия.
      await this.usersService.applyGameRewards(userId, {
        xpEarned: reward.xp,
        coinsEarned: reward.coins,
      });
    }

    const fresh = await this.prisma.hotColdAttempt.findUnique({
      where: { id: attempt.id },
      include: { word: true },
    });

    return {
      state: this.toState(
        fresh as AttemptRow,
        date,
        // Только свободные партии тратят свободный бюджет. Слово дня
        // считается отдельно, и без этой оговорки оно съедало весь дневной
        // остаток разом — «ещё слово» сразу после него обещало ноль опыта.
        freeXpSpent +
          (solved && attempt.round !== HOT_COLD_DAILY_ROUND ? reward.xp : 0),
      ),
      rank,
      fix: resolved.fix,
      understood: resolved.fix === 'none' ? null : resolved.word,
      repeat: false,
    };
  }

  /**
   * «Это слово должно быть ближе» — несогласие игрока с расстоянием.
   *
   * Ради этого всё и затевалось. Связи в `known-links.ts` написаны из одной
   * головы, и что они совпадают с чужими ассоциациями — ничем не доказано.
   * Здесь копятся настоящие промахи: те, что заметили живые люди, а не те,
   * что я сам придумал проверить.
   *
   * Отметка живёт и в партии (чтобы игрок видел, что его услышали), и
   * отдельной строкой в базе — партия через день никому не нужна, а список
   * промахов нужен долго.
   */
  async dispute(
    userId: string,
    timezoneOffsetMinutes: number,
    rawWord: string,
    round?: number,
  ): Promise<HotColdState> {
    const { attempt, date } = await this.loadOrCreateAttempt(
      userId,
      timezoneOffsetMinutes,
      round,
    );
    const freeXpSpent = await this.freeXpSpent(userId, date);
    const guesses = readGuesses(attempt.guesses);
    const target = guesses.find((entry) => entry.word === rawWord.trim());
    if (!target) {
      throw new BadRequestException('Такого слова в этой партии не было');
    }
    if (target.disputed) return this.toState(attempt, date, freeXpSpent);
    // Считаем по базе, а не по этой партии: партий за день теперь сколько
    // угодно, и лимит «восемь за день» иначе стал бы «восемь за партию»,
    // то есть никаким.
    const marksToday = await this.prisma.hotColdFeedback.count({
      where: { userId, date },
    });
    if (marksToday >= HOT_COLD_FEEDBACK_LIMIT) {
      throw new BadRequestException('На сегодня отметок хватит');
    }

    target.disputed = true;
    const updated = await this.prisma.hotColdAttempt.update({
      where: { id: attempt.id },
      data: { guesses: writeGuesses(guesses) },
      include: { word: true },
    });
    // Отдельная строка — то, ради чего кнопка и существует. `upsert`
    // потому, что два нажатия подряд с одного устройства — обычное дело.
    await this.prisma.hotColdFeedback.upsert({
      where: {
        userId_date_wordId_guess: {
          userId,
          date,
          wordId: attempt.word.id,
          guess: target.word,
        },
      },
      create: {
        userId,
        date,
        wordId: attempt.word.id,
        guess: target.word,
        rank: target.rank,
      },
      update: {},
    });
    return this.toState(updated, date, freeXpSpent);
  }

  /**
   * Сдаться: показать слово и закончить партию.
   *
   * Без этого игра умела загонять в тупик: полсотни слов, ни одной
   * зацепки, подсказки кончились — и выйти некуда. Хуже того, незакрытая
   * партия дня не даёт взять свободную, то есть застрявший оставался без
   * игры вовсе.
   *
   * Награды нет, и это честно: слово не найдено. Но разбор показывается
   * полностью — ради него сюда и приходят, а ушедший ни с чем не узнает
   * даже, что было рядом.
   */
  async giveUp(
    userId: string,
    timezoneOffsetMinutes: number,
    round?: number,
  ): Promise<HotColdState> {
    const { attempt, date } = await this.loadOrCreateAttempt(
      userId,
      timezoneOffsetMinutes,
      round,
    );
    if (attempt.finishedAt) {
      return this.toState(attempt, date, await this.freeXpSpent(userId, date));
    }
    // Тем же атомарным захватом, что и победа: сдаться и угадать в одну
    // миллисекунду нельзя, и решает то, что применилось первым.
    await this.prisma.hotColdAttempt.updateMany({
      where: { id: attempt.id, finishedAt: null },
      data: { gaveUp: true, finishedAt: new Date() },
    });
    const fresh = await this.prisma.hotColdAttempt.findUnique({
      where: { id: attempt.id },
      include: { word: true },
    });
    return this.toState(
      fresh as AttemptRow,
      date,
      await this.freeXpSpent(userId, date),
    );
  }

  /**
   * Подсказка открывает слово вдвое ближе лучшего найденного.
   *
   * Приём из оригинальной игры, и он честнее фиксированного места: пока
   * игрок далеко, подсказка тащит его к теме, а когда он уже рядом — не
   * выдаёт ответ. Открытое слово ложится в тот же список с пометкой, чтобы
   * в конце было видно, что найдено самим, а что подсказано.
   */
  async takeHint(
    userId: string,
    timezoneOffsetMinutes: number,
    round?: number,
  ): Promise<HotColdState> {
    const { attempt, date } = await this.loadOrCreateAttempt(
      userId,
      timezoneOffsetMinutes,
      round,
    );
    if (attempt.finishedAt) {
      throw new BadRequestException('Это слово уже угадано');
    }
    const kind = hotColdHintKind(attempt.hintsUsed);
    if (kind !== 'WORD') {
      // Подсказки-факты не имеют места в рейтинге, поэтому ложатся в свой
      // список, а не в догадки: положить их туда значило бы приписать им
      // расстояние, которого у них нет.
      const text =
        kind === 'SHAPE' ? shapeHint(attempt.word.word) : attempt.word.gloss;
      const updated = await this.prisma.hotColdAttempt.update({
        where: { id: attempt.id },
        data: {
          hintsUsed: { increment: 1 },
          hints: writeHints([...readHints(attempt.hints), { kind, text }]),
        },
        include: { word: true },
      });
      return this.toState(updated, date, await this.freeXpSpent(userId, date));
    }

    const guesses = readGuesses(attempt.guesses);
    const best = guesses.reduce(
      (lowest, entry) => Math.min(lowest, entry.rank),
      Number.POSITIVE_INFINITY,
    );
    const ranking = this.rankingFor(attempt.word);
    const target = Number.isFinite(best)
      ? Math.max(HOT_COLD_HINT_FLOOR, Math.floor(best / HOT_COLD_HINT_DIVISOR))
      : HOT_COLD_HINT_FIRST;

    const known = new Set(guesses.map((entry) => entry.word));
    const hint = ranking.wordAt(
      target,
      known,
      (lemma) => lemma < HOT_COLD_HINT_COMMON_LIMIT,
    );
    if (!hint) {
      // Практически недостижимо: слово ищется по всему словарю, и не найтись
      // ему нечему, кроме как если открыто уже всё вокруг. Сообщение всё
      // равно должно говорить, что делать дальше, а не просто «нельзя».
      throw new BadRequestException(
        'Открыто уже всё, кроме самого слова, — дальше только «сдаюсь»',
      );
    }

    const updated = await this.prisma.hotColdAttempt.update({
      where: { id: attempt.id },
      data: {
        hintsUsed: { increment: 1 },
        guesses: writeGuesses([
          ...guesses,
          { word: hint.word, rank: hint.rank, revealed: true },
        ]),
      },
      include: { word: true },
    });
    return this.toState(updated, date, await this.freeXpSpent(userId, date));
  }
}

/**
 * Награда свободной партии: доля от обычной, и не больше дневного остатка.
 *
 * Обе границы нужны по разным причинам. Доля — чтобы слово дня осталось
 * главным: без неё вечер свободных партий давал бы больше, чем месяц
 * ежедневной игры. Дневной потолок — чтобы у долгой игры вообще был предел:
 * доля от чего-то, повторённого двести раз, всё равно много.
 *
 * Ноль в остатке не запрещает играть — он только останавливает начисление,
 * и игра говорит об этом до партии, а не после.
 */
function capFreeReward(
  reward: { xp: number; coins: number },
  free: boolean,
  xpLeft: number,
): { xp: number; coins: number } {
  if (!free) return reward;
  const xp = Math.min(
    xpLeft,
    Math.max(1, Math.round(reward.xp * HOT_COLD_FREE_REWARD_SHARE)),
  );
  // Монеты идут за опытом: начислять их, когда опыт кончился, значило бы
  // оставить обходной путь к той же ферме.
  const coins =
    xp === 0
      ? 0
      : Math.max(1, Math.round(reward.coins * HOT_COLD_FREE_REWARD_SHARE));
  return { xp: Math.max(0, xp), coins };
}

/**
 * Догадки из JSON-поля.
 *
 * В базе лежит `Json`, то есть с точки зрения типов — что угодно. Разбираем
 * с проверкой: строка, испорченная чужой рукой или старой версией, не должна
 * ронять экран.
 */
/**
 * Догадки обратно в JSON.
 *
 * Prisma принимает в `Json` только простые значения, а не наши интерфейсы,
 * поэтому раскладываем поля руками. Заодно это единственное место, где
 * задаётся, что именно лежит в базе.
 */
function writeGuesses(guesses: HotColdGuess[]): Prisma.InputJsonValue {
  return guesses.map((entry) => ({
    word: entry.word,
    rank: entry.rank,
    ...(entry.revealed ? { revealed: true } : {}),
    ...(entry.disputed ? { disputed: true } : {}),
  }));
}

/** Подсказки-факты в JSON и обратно. */
function writeHints(
  hints: { kind: HotColdHintKind; text: string }[],
): Prisma.InputJsonValue {
  return hints.map((hint) => ({ kind: hint.kind, text: hint.text }));
}

function readHints(value: unknown): { kind: HotColdHintKind; text: string }[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is { kind: HotColdHintKind; text: string } =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as { text?: unknown }).text === 'string' &&
      ['WORD', 'SHAPE', 'GLOSS'].includes(
        (entry as { kind?: unknown }).kind as string,
      ),
  );
}

/**
 * «Слово из семи букв, начинается на „К"».
 *
 * Длина и первая буква вместе сужают поиск куда сильнее, чем каждая по
 * отдельности, и при этом не называют ответ — в отличие от описания,
 * которое идёт следующей ступенью.
 */
function shapeHint(word: string): string {
  const clean = word.trim();
  const letters = clean.length;
  const first = clean[0]?.toUpperCase() ?? '';
  const noun =
    letters % 10 === 1 && letters % 100 !== 11
      ? 'буквы'
      : letters % 10 >= 2 &&
          letters % 10 <= 4 &&
          (letters % 100 < 10 || letters % 100 >= 20)
        ? 'букв'
        : 'букв';
  return `Слово из ${letters} ${noun}, начинается на «${first}»`;
}

function readGuesses(value: unknown): HotColdGuess[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is HotColdGuess =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as HotColdGuess).word === 'string' &&
      typeof (entry as HotColdGuess).rank === 'number',
  );
}
