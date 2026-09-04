import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  HOT_COLD_HINT_COUNT,
  HOT_COLD_HINT_DIVISOR,
  HOT_COLD_FEEDBACK_LIMIT,
  HOT_COLD_HINT_COMMON_LIMIT,
  HOT_COLD_HINT_FIRST,
  HOT_COLD_HINT_FLOOR,
  HOT_COLD_SECRET_COMMON_LIMIT,
  HOT_COLD_SECRET_MIN_EPISODES,
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
  guesses: unknown;
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
  private async pickWordFor(date: Date): Promise<WordRow> {
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
    const ordered = shuffledByKey(usable, (row) => row.id);
    return ordered[dayIndex(date, ordered.length)];
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

  private async loadOrCreateAttempt(
    userId: string,
    timezoneOffsetMinutes: number,
  ) {
    const date = localDate(timezoneOffsetMinutes);
    const existing = await this.prisma.hotColdAttempt.findUnique({
      where: { userId_date: { userId, date } },
      include: { word: true },
    });
    if (existing) return { attempt: existing, date };

    const word = await this.pickWordFor(date);
    // `upsert`, а не `create`: два запроса подряд с одного устройства —
    // обычное дело при быстром открытии экрана, и второй не должен падать
    // на уникальном индексе.
    const attempt = await this.prisma.hotColdAttempt.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, wordId: word.id },
      update: {},
      include: { word: true },
    });
    return { attempt, date };
  }

  async getState(
    userId: string,
    timezoneOffsetMinutes: number,
  ): Promise<HotColdState> {
    const { attempt, date } = await this.loadOrCreateAttempt(
      userId,
      timezoneOffsetMinutes,
    );
    return this.toState(attempt, date);
  }

  private toState(attempt: AttemptRow, date: Date): HotColdState {
    const finished = attempt.finishedAt !== null;
    const guesses = readGuesses(attempt.guesses);
    const ranking = finished ? this.rankingFor(attempt.word) : null;

    return {
      date: dateLabel(date),
      // Ближайшая догадка сверху: список читается как «насколько я близко»,
      // а не как история ходов, и порядок появления здесь ничего не значит.
      guesses: [...guesses].sort((a, b) => a.rank - b.rank),
      vocabulary: this.semantics.size,
      hintsLeft: Math.max(0, HOT_COLD_HINT_COUNT - attempt.hintsUsed),
      disputesLeft: Math.max(
        0,
        HOT_COLD_FEEDBACK_LIMIT -
          guesses.filter((entry) => entry.disputed).length,
      ),
      solved: attempt.solved,
      finished,
      rewardIfSolvedNow: hotColdReward(
        attempt.guessCount + 1,
        attempt.hintsUsed,
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
  ): Promise<HotColdGuessResult> {
    const trimmed = rawGuess.trim();
    if (trimmed.length === 0) throw new BadRequestException('Пустой ответ');

    const { attempt, date } = await this.loadOrCreateAttempt(
      userId,
      timezoneOffsetMinutes,
    );
    if (attempt.finishedAt) {
      throw new BadRequestException('Слово на сегодня уже угадано');
    }

    const resolved = this.semantics.resolve(trimmed);
    if (!resolved) {
      // Честное «не знаю такого слова» — и оно не стоит попытки: наказывать
      // за то, что словарь чего-то не содержит, было бы нечестно.
      return {
        state: this.toState(attempt, date),
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
        state: this.toState(attempt, date),
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
    const reward = hotColdReward(guessCount, attempt.hintsUsed);

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

    if (solved && claimed.count > 0) {
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
      state: this.toState(fresh as AttemptRow, date),
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
  ): Promise<HotColdState> {
    const { attempt, date } = await this.loadOrCreateAttempt(
      userId,
      timezoneOffsetMinutes,
    );
    const guesses = readGuesses(attempt.guesses);
    const target = guesses.find((entry) => entry.word === rawWord.trim());
    if (!target) {
      throw new BadRequestException('Такого слова в этой партии не было');
    }
    if (target.disputed) return this.toState(attempt, date);
    if (
      guesses.filter((entry) => entry.disputed).length >=
      HOT_COLD_FEEDBACK_LIMIT
    ) {
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
        userId_date_guess: { userId, date, guess: target.word },
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
    return this.toState(updated, date);
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
  ): Promise<HotColdState> {
    const { attempt, date } = await this.loadOrCreateAttempt(
      userId,
      timezoneOffsetMinutes,
    );
    if (attempt.finishedAt) {
      throw new BadRequestException('Слово на сегодня уже угадано');
    }
    if (attempt.hintsUsed >= HOT_COLD_HINT_COUNT) {
      throw new BadRequestException('Подсказки на сегодня кончились');
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
      throw new BadRequestException('Ближе подсказывать уже нечего');
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
    return this.toState(updated, date);
  }
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
