import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  ALIAS_CATEGORY_LABELS,
  DAILY_WORD_HINT_COUNT,
  DAILY_WORD_MAX_ATTEMPTS,
  dailyWordReward,
  formatAliasReference,
  isDailyWordInflection,
  isDailyWordMatch,
  isDailyWordNearMatch,
  normalizeDailyWordGuess,
  type AliasCategory,
  type AliasReference,
  type AliasTestament,
  type DailyWordFriendResult,
  type DailyWordFriendsResponse,
  type DailyWordGuessResult,
  type DailyWordHint,
  type DailyWordState,
} from '@bible-arena/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

const TESTAMENT_LABELS: Record<AliasTestament, string> = {
  OLD: 'Ветхий Завет',
  NEW: 'Новый Завет',
  BOTH: 'Оба Завета',
};

/** Строка попытки вместе со словом — ровно то, из чего собирается ответ
 * клиенту. Назван явно, чтобы не приводить типы к `never` в трёх местах. */
interface AttemptRow {
  id: string;
  userId: string;
  attemptsUsed: number;
  hintsUsed: number;
  solved: boolean;
  finishedAt: Date | null;
  xpEarned: number;
  coinsEarned: number;
  word: WordRow;
}

interface WordRow {
  id: string;
  word: string;
  /** Другие ответы, засчитываемые как верные — см. `seed-alias.ts`. */
  accepts: string[];
  gloss: string;
  category: AliasCategory;
  testament: AliasTestament;
  refBookId: number | null;
  refChapter: number | null;
  refVerse: number | null;
}

@Injectable()
export class DailyWordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Все слова банка в нормализованном виде. Нужны, чтобы отличить падеж от
   * другого слова: «Сила» — приемлемая основа для «Силом» по форме, но это
   * отдельное слово банка, и засчитывать его как форму нельзя.
   *
   * Банк меняется только при заливке сида, поэтому список держится в памяти
   * до перезапуска — 520 коротких строк.
   */
  private knownWords: Set<string> | null = null;

  private async loadKnownWords(): Promise<Set<string>> {
    if (this.knownWords) return this.knownWords;
    const rows = await this.prisma.aliasWord.findMany({
      select: { word: true },
    });
    this.knownWords = new Set(
      rows.map((row) => normalizeDailyWordGuess(row.word)),
    );
    return this.knownWords;
  }

  /**
   * Засчитывается ли ответ. Три уровня снисходительности, каждый со своей
   * защитой:
   *
   * 1. точное совпадение (с точностью до регистра, «ё» и дефисов);
   * 2. один из принимаемых вариантов слова — значимая часть составного
   *    имени или другое написание, заранее проверенные на однозначность;
   * 3. та же основа, другое окончание — но только если ответ не является
   *    отдельным словом банка.
   */
  private async isAccepted(guess: string, word: WordRow): Promise<boolean> {
    const variants = [word.word, ...word.accepts];
    if (variants.some((variant) => isDailyWordMatch(guess, variant)))
      return true;

    const known = await this.loadKnownWords();
    if (known.has(normalizeDailyWordGuess(guess))) return false;
    return variants.some((variant) => isDailyWordInflection(guess, variant));
  }

  // ---- какое слово сегодня ----

  /**
   * Локальная дата игрока в виде полуночи по UTC — тот же приём, что у
   * серии дней, и по той же причине: слово должно меняться в его полночь, а
   * не в чьей-то чужой.
   *
   * Следствие, которое стоит понимать: у двух друзей из разных часовых
   * поясов слово в один и тот же момент может отличаться. Это честнее
   * обратного варианта — общего для всех дня по UTC, при котором у половины
   * аудитории «сегодняшнее» слово менялось бы посреди дня.
   */
  private localDate(timezoneOffsetMinutes: number): Date {
    const shifted = new Date(Date.now() - timezoneOffsetMinutes * 60_000);
    return new Date(
      Date.UTC(
        shifted.getUTCFullYear(),
        shifted.getUTCMonth(),
        shifted.getUTCDate(),
      ),
    );
  }

  private dateLabel(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  /**
   * Выбирает слово дня.
   *
   * Порядок слов — стабильная псевдослучайная перестановка: сортируем по
   * хешу от `id`, и берём элемент по номеру дня. Не `случайное по хешу
   * даты`, потому что тогда слова повторялись бы задолго до того, как банк
   * кончится (парадокс дней рождения бьёт по этому больно). Так же цикл
   * ровно в длину банка: 520 слов — 520 дней без единого повтора.
   *
   * Слово одно и то же для всех, кто играет в этот день: расчёт зависит
   * только от даты, а не от игрока. Это условие всей социальной части —
   * сравнивать результаты имеет смысл только по одному и тому же слову.
   */
  private async pickWordFor(date: Date): Promise<WordRow> {
    const words = await this.prisma.aliasWord.findMany({
      select: {
        id: true,
        word: true,
        accepts: true,
        gloss: true,
        category: true,
        testament: true,
        refBookId: true,
        refChapter: true,
        refVerse: true,
      },
    });
    if (words.length === 0) {
      throw new BadRequestException(
        'Банк слов пуст — слово дня не из чего выбрать',
      );
    }

    const ordered = [...words].sort((a, b) =>
      hashOf(a.id).localeCompare(hashOf(b.id)),
    );
    return ordered[dailyWordIndex(date, ordered.length)];
  }

  // ---- состояние дня ----

  private async loadOrCreateAttempt(
    userId: string,
    timezoneOffsetMinutes: number,
  ) {
    const date = this.localDate(timezoneOffsetMinutes);
    const existing = await this.prisma.dailyWordAttempt.findUnique({
      where: { userId_date: { userId, date } },
      include: { word: true },
    });
    if (existing) return { attempt: existing, date };

    const word = await this.pickWordFor(date);
    // `upsert`, а не `create`: два запроса подряд с одного устройства —
    // обычное дело при быстром открытии экрана, и второй не должен падать
    // на уникальном индексе.
    const attempt = await this.prisma.dailyWordAttempt.upsert({
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
  ): Promise<DailyWordState> {
    const { attempt, date } = await this.loadOrCreateAttempt(
      userId,
      timezoneOffsetMinutes,
    );
    return this.toState(attempt, date);
  }

  private toState(attempt: AttemptRow, date: Date): DailyWordState {
    const finished = attempt.finishedAt !== null;
    const reference = toReference(attempt.word);

    return {
      date: this.dateLabel(date),
      gloss: attempt.word.gloss,
      attemptsUsed: attempt.attemptsUsed,
      attemptsLeft: Math.max(0, DAILY_WORD_MAX_ATTEMPTS - attempt.attemptsUsed),
      hints: this.buildHints(attempt.word, attempt.hintsUsed),
      hintsLeft: Math.max(0, DAILY_WORD_HINT_COUNT - attempt.hintsUsed),
      rewardIfSolvedNow: dailyWordReward(attempt.hintsUsed),
      solved: attempt.solved,
      finished,
      // Слово, категория и ссылка появляются только после конца игры: иначе
      // ответ приезжал бы в самом первом запросе, и вся игра сводилась бы к
      // открытой вкладке разработчика.
      word: finished ? attempt.word.word : null,
      category: finished ? attempt.word.category : null,
      testament: finished ? attempt.word.testament : null,
      reference: finished ? reference : null,
      earned: attempt.solved
        ? { xp: attempt.xpEarned, coins: attempt.coinsEarned }
        : null,
    };
  }

  /**
   * Подсказки идут от самой общей к самой конкретной, и последняя — ссылка
   * на место в Писании. Это сделано намеренно: самая сильная подсказка
   * заодно и открывает главу, то есть цена ответа — прочитать.
   *
   * У сквозных слов («покаяние», «завет») ссылки нет, и третьей подсказкой
   * становится последняя буква. Придумывать им место было бы враньём, а
   * оставить человека с двумя подсказками вместо трёх — несправедливо.
   */
  private buildHints(word: WordRow, hintsUsed: number): DailyWordHint[] {
    const all: DailyWordHint[] = [
      {
        kind: 'CATEGORY',
        text: `${ALIAS_CATEGORY_LABELS[word.category]} · ${TESTAMENT_LABELS[word.testament]}`,
      },
      {
        kind: 'SHAPE',
        text: describeShape(word.word),
      },
      toReference(word)
        ? {
            kind: 'REFERENCE',
            text: toReference(word)!.label,
            reference: toReference(word),
          }
        : {
            kind: 'SHAPE',
            text: `Заканчивается на «${lastLetter(word.word)}»`,
          },
    ];
    return all.slice(0, Math.min(hintsUsed, DAILY_WORD_HINT_COUNT));
  }

  // ---- ход игры ----

  async takeHint(
    userId: string,
    timezoneOffsetMinutes: number,
  ): Promise<DailyWordState> {
    const { attempt, date } = await this.loadOrCreateAttempt(
      userId,
      timezoneOffsetMinutes,
    );
    if (attempt.finishedAt) {
      throw new BadRequestException('Слово дня на сегодня уже сыграно');
    }
    if (attempt.hintsUsed >= DAILY_WORD_HINT_COUNT) {
      throw new BadRequestException('Подсказки на сегодня кончились');
    }

    const updated = await this.prisma.dailyWordAttempt.update({
      where: { id: attempt.id },
      data: { hintsUsed: { increment: 1 } },
      include: { word: true },
    });
    return this.toState(updated, date);
  }

  async guess(
    userId: string,
    timezoneOffsetMinutes: number,
    rawGuess: string,
  ): Promise<DailyWordGuessResult> {
    const guess = rawGuess.trim();
    if (guess.length === 0) {
      throw new BadRequestException('Пустой ответ');
    }

    const { attempt, date } = await this.loadOrCreateAttempt(
      userId,
      timezoneOffsetMinutes,
    );
    if (attempt.finishedAt) {
      throw new BadRequestException('Слово дня на сегодня уже сыграно');
    }

    const correct = await this.isAccepted(guess, attempt.word);
    const attemptsUsed = attempt.attemptsUsed + 1;
    const outOfAttempts = !correct && attemptsUsed >= DAILY_WORD_MAX_ATTEMPTS;
    const reward = dailyWordReward(attempt.hintsUsed);

    // Одна запись на весь исход: `updateMany` с условием «ещё не закончено»
    // отсекает второй одновременный ответ, который иначе начислил бы
    // награду дважды.
    const claimed = await this.prisma.dailyWordAttempt.updateMany({
      where: { id: attempt.id, finishedAt: null },
      data: {
        attemptsUsed,
        solved: correct,
        finishedAt: correct || outOfAttempts ? new Date() : null,
        xpEarned: correct ? reward.xp : 0,
        coinsEarned: correct ? reward.coins : 0,
      },
    });

    if (correct && claimed.count > 0) {
      // Награда и серия дней — общим путём со всеми остальными режимами,
      // чтобы слово дня двигало серию так же, как сыгранная партия.
      await this.usersService.applyGameRewards(userId, {
        xpEarned: reward.xp,
        coinsEarned: reward.coins,
      });
    }

    const fresh = await this.prisma.dailyWordAttempt.findUnique({
      where: { id: attempt.id },
      include: { word: true },
    });

    return {
      correct,
      near:
        !correct &&
        [attempt.word.word, ...attempt.word.accepts].some((variant) =>
          isDailyWordNearMatch(guess, variant),
        ),
      state: this.toState(fresh as AttemptRow, date),
      normalizedMatch: correct && guess !== attempt.word.word,
    };
  }

  // ---- друзья ----

  /**
   * Результаты друзей за тот же день. Самого слова здесь нет — иначе список
   * друзей стал бы способом узнать ответ, не играя.
   */
  async friendResults(
    userId: string,
    timezoneOffsetMinutes: number,
  ): Promise<DailyWordFriendsResponse> {
    const date = this.localDate(timezoneOffsetMinutes);

    const friendships = await this.prisma.friendship.findMany({
      where: { userId },
      select: { friendId: true },
    });
    const friendIds = friendships.map((row) => row.friendId);

    // Одним запросом на всех, включая себя: отдельный запрос за своей
    // строкой был бы вторым обращением к той же таблице за тем же днём.
    const [rows, users] = await Promise.all([
      this.prisma.dailyWordAttempt.findMany({
        where: { userId: { in: [userId, ...friendIds] }, date },
      }),
      this.prisma.user.findMany({
        where: { id: { in: [userId, ...friendIds] } },
        select: { id: true, nickname: true, avatarUrl: true },
      }),
    ]);

    const byId = new Map(users.map((user) => [user.id, user] as const));
    const attemptByUser = new Map(
      rows.map((row) => [row.userId, row] as const),
    );

    const toResult = (
      id: string,
      attempt: (typeof rows)[number] | undefined,
    ) => {
      const user = byId.get(id);
      const finished = attempt?.finishedAt != null;
      return {
        userId: id,
        nickname: user?.nickname ?? null,
        avatarUrl: user?.avatarUrl ?? null,
        solved: attempt?.solved ?? false,
        // Пока друг не закончил, его цифры не показываем: «три попытки и
        // ещё играет» — это подглядывание, а не результат.
        hintsUsed: finished ? (attempt?.hintsUsed ?? null) : null,
        attemptsUsed: finished ? (attempt?.attemptsUsed ?? null) : null,
      } satisfies DailyWordFriendResult;
    };

    const friends = friendIds
      .map((id) => toResult(id, attemptByUser.get(id)))
      .sort(sortByResult);

    return {
      date: this.dateLabel(date),
      me: toResult(userId, attemptByUser.get(userId)),
      friends,
    };
  }
}

/** Решившие — выше; среди них меньше подсказок, потом меньше попыток. */
function sortByResult(
  a: DailyWordFriendResult,
  b: DailyWordFriendResult,
): number {
  if (a.solved !== b.solved) return a.solved ? -1 : 1;
  if (!a.solved) return 0;
  const hints = (a.hintsUsed ?? 99) - (b.hintsUsed ?? 99);
  if (hints !== 0) return hints;
  return (a.attemptsUsed ?? 99) - (b.attemptsUsed ?? 99);
}

/**
 * Позиция дня в банке. Вынесена отдельной чистой функцией не ради красоты:
 * обещание «520 слов — 520 дней без повтора» иначе никак не проверить, а
 * необещанное поведение выбора слова заметят только через год.
 */
export function dailyWordIndex(date: Date, bankSize: number): number {
  const dayNumber = Math.floor(date.getTime() / 86_400_000);
  // Остаток может быть отрицательным для дат до 1970 — на практике нет, но
  // привести к неотрицательному дешевле, чем потом это ловить.
  return ((dayNumber % bankSize) + bankSize) % bankSize;
}

function hashOf(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function toReference(word: WordRow): AliasReference | null {
  const { refBookId, refChapter, refVerse } = word;
  if (refBookId === null || refChapter === null || refVerse === null)
    return null;
  const label = formatAliasReference(refBookId, refChapter, refVerse);
  if (!label) return null;
  return { bookId: refBookId, chapter: refChapter, verse: refVerse, label };
}

/**
 * «7 букв, начинается на В» — и отдельно про составные, где счёт букв сам
 * по себе бесполезен без подсказки, что слов несколько.
 */
function describeShape(word: string): string {
  const letters = word.replace(/[^\p{L}]/gu, '');
  const parts = word.split(/[\s-]+/).filter(Boolean);
  const first = letters.charAt(0).toUpperCase();
  const count = `${letters.length} ${pluralLetters(letters.length)}`;
  if (parts.length > 1) {
    return `${parts.length} слова, ${count}, начинается на «${first}»`;
  }
  return `${count}, начинается на «${first}»`;
}

function lastLetter(word: string): string {
  const letters = word.replace(/[^\p{L}]/gu, '');
  return letters.charAt(letters.length - 1).toUpperCase();
}

function pluralLetters(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'буква';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'буквы';
  return 'букв';
}
