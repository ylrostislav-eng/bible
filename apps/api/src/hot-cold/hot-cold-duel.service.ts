import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  HOT_COLD_DUEL_IDLE_MS,
  HOT_COLD_DUEL_LOSER_SHARE,
  HOT_COLD_DUEL_LOSS_RATING,
  HOT_COLD_DUEL_WAIT_MS,
  HOT_COLD_DUEL_WIN_RATING,
  HOT_COLD_SECRET_COMMON_LIMIT,
  HOT_COLD_SECRET_MIN_EPISODES,
  hotColdReward,
  type HotColdDuelGuess,
  type HotColdDuelState,
} from '@bible-arena/shared';
import { generateInviteCode } from '../game/invite-code';
import { PrismaService } from '../prisma/prisma.service';
import {
  SemanticsService,
  type SemanticRanking,
} from '../semantics/semantics.service';
import { UsersService } from '../users/users.service';

/**
 * Дуэль «горячо-холодно»: двое ищут одно слово наперегонки.
 *
 * Всё, чем игра считает расстояние, лежит в `SemanticsService` — здесь
 * только правила встречи двоих.
 *
 * ## Что тут важно не сломать
 *
 * **Слова противника не уезжают клиенту никогда.** Ни в одном состоянии,
 * ни после конца игры. Числа — да, слова — нет: увидев чужой список,
 * соперник просто перепишет его и обгонит на один ход. Единственное место,
 * где это обеспечивается, — `toState`; проверять надо там.
 *
 * **Победа достаётся первому и только одному.** Двое могут отправить
 * верное слово в одну и ту же миллисекунду, и решает это `updateMany` с
 * условием «победителя ещё нет»: проигравшая гонку запись просто не
 * применится, а не перезапишет чужую победу.
 */

/** Сколько ближайших слов показать в разборе после дуэли. */
const CLOSEST_SHOWN = 10;

/** Ранжирований в памяти: дуэлей одновременно немного, но каждая своя. */
const RANKING_CACHE_LIMIT = 8;

interface WordRow {
  id: string;
  word: string;
  gloss: string;
}

type LoadedDuel = Prisma.HotColdDuelGetPayload<{
  include: {
    word: true;
    players: { include: { user: true } };
  };
}>;

@Injectable()
export class HotColdDuelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly semantics: SemanticsService,
  ) {}

  private readonly rankings = new Map<string, SemanticRanking>();
  /** Кто прямо сейчас на связи: заполняет шлюз, читает `toState`. */
  private readonly online = new Set<string>();

  // ---- присутствие ----

  setOnline(duelId: string, userId: string, present: boolean): void {
    const key = `${duelId}:${userId}`;
    if (present) this.online.add(key);
    else this.online.delete(key);
  }

  // ---- создание и вход ----

  /**
   * Слово для дуэли.
   *
   * Не берётся то, что кто-то из двоих уже играл сегодня в одиночку: иначе
   * один начинал бы, зная ответ, и дуэль была бы решена до первого хода.
   */
  private async pickWord(userIds: string[]): Promise<WordRow> {
    const words = await this.prisma.aliasWord.findMany({
      select: { id: true, word: true, gloss: true },
    });
    // Сегодняшние партии, а не все за историю: за год ежедневной игры
    // человек проходит весь банк, и «чего он не играл» стало бы пустым.
    // Полтора суток вместо ровных — часовые пояса игроков разные, и
    // «сегодня» у них не совпадает.
    const playedToday = await this.prisma.hotColdAttempt.findMany({
      where: {
        userId: { in: userIds },
        date: { gte: new Date(Date.now() - 36 * 3600_000) },
      },
      select: { wordId: true },
    });
    const seen = new Set(playedToday.map((row) => row.wordId));

    const suitable = (row: WordRow): boolean => {
      const lemma = this.semantics.lookup(row.word);
      if (lemma === null) return false;
      return (
        lemma < HOT_COLD_SECRET_COMMON_LIMIT ||
        this.semantics.episodesFor(lemma) >= HOT_COLD_SECRET_MIN_EPISODES
      );
    };
    const fit = words.filter(suitable);
    const usable = fit.filter((row) => !seen.has(row.id));
    if (usable.length === 0) {
      // Три разные беды — три разных ответа. Общее «не осталось слов»
      // отправило бы искать несуществующую причину: при пустом банке или
      // незагруженном словаре играть не «уже сыграли», а нечем в принципе.
      if (!this.semantics.ready) {
        throw new BadRequestException(
          'Словарь смыслов не загружен — игра недоступна',
        );
      }
      if (fit.length === 0) {
        throw new BadRequestException(
          'В банке нет слов, которые годятся для этой игры',
        );
      }
      throw new BadRequestException(
        'Вы оба сегодня сыграли все слова — дуэль будет завтра',
      );
    }
    return usable[Math.floor(Math.random() * usable.length)];
  }

  /**
   * Создать дуэль и ждать соперника.
   *
   * `targetUserId` — вызов конкретному другу: тогда по коду зайдёт только
   * он. Без него зайдёт любой, кому код дали.
   */
  async create(userId: string, targetUserId?: string): Promise<string> {
    if (targetUserId === userId) {
      throw new BadRequestException('Нельзя вызвать самого себя');
    }
    const existing = await this.activeFor(userId);
    if (existing) {
      // Вторая дуэль поверх незакрытой — верный способ бросить обе.
      throw new BadRequestException(
        'У вас уже есть незаконченная дуэль — сначала доиграйте её',
      );
    }
    const word = await this.pickWord(
      targetUserId ? [userId, targetUserId] : [userId],
    );
    const duel = await this.prisma.hotColdDuel.create({
      data: {
        inviteCode: generateInviteCode(),
        targetUserId: targetUserId ?? null,
        wordId: word.id,
        players: { create: { userId } },
      },
    });
    return duel.id;
  }

  /** Незакрытая дуэль игрока, если есть. */
  async activeFor(userId: string): Promise<string | null> {
    const found = await this.prisma.hotColdDuel.findFirst({
      where: {
        status: { in: ['WAITING', 'IN_PROGRESS'] },
        players: { some: { userId } },
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    return found?.id ?? null;
  }

  /** Войти по коду. */
  async joinByCode(userId: string, rawCode: string): Promise<string> {
    const code = rawCode.trim().toUpperCase();
    const duel = await this.prisma.hotColdDuel.findUnique({
      where: { inviteCode: code },
      include: { players: true },
    });
    if (!duel) throw new NotFoundException('Дуэль по такому коду не найдена');
    if (duel.players.some((player) => player.userId === userId)) return duel.id;
    if (duel.status !== 'WAITING') {
      throw new BadRequestException('К этой дуэли уже нельзя присоединиться');
    }
    if (duel.targetUserId && duel.targetUserId !== userId) {
      throw new ForbiddenException('Этот вызов адресован другому игроку');
    }
    if (duel.players.length >= 2) {
      throw new BadRequestException('В дуэли уже двое');
    }

    // `updateMany` с условием «ещё ждёт»: двое, нажавших «войти»
    // одновременно, иначе оба стали бы вторым игроком.
    const claimed = await this.prisma.hotColdDuel.updateMany({
      where: { id: duel.id, status: 'WAITING' },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new BadRequestException('Кто-то успел войти раньше');
    }
    await this.prisma.hotColdDuelPlayer.create({
      data: { duelId: duel.id, userId },
    });
    return duel.id;
  }

  // ---- состояние ----

  private async load(duelId: string): Promise<LoadedDuel> {
    const duel = await this.prisma.hotColdDuel.findUnique({
      where: { id: duelId },
      include: { word: true, players: { include: { user: true } } },
    });
    if (!duel) throw new NotFoundException('Дуэль не найдена');
    return duel;
  }

  private rankingFor(word: WordRow): SemanticRanking {
    const cached = this.rankings.get(word.id);
    if (cached) return cached;
    const lemma = this.semantics.lookup(word.word);
    if (lemma === null) {
      throw new BadRequestException('Игра не знает загаданного слова');
    }
    const ranking = this.semantics.rank(lemma);
    if (this.rankings.size >= RANKING_CACHE_LIMIT) {
      for (const oldest of this.rankings.keys()) {
        this.rankings.delete(oldest);
        break;
      }
    }
    this.rankings.set(word.id, ranking);
    return ranking;
  }

  async getState(duelId: string, userId: string): Promise<HotColdDuelState> {
    return this.toState(await this.load(duelId), userId);
  }

  /**
   * Состояние глазами одного игрока.
   *
   * Единственное место, где решается, что противник о вас узнает. Слова
   * отсюда не уезжают ни при каком статусе — только их места.
   */
  private toState(duel: LoadedDuel, userId: string): HotColdDuelState {
    const me = duel.players.find((player) => player.userId === userId);
    if (!me) throw new ForbiddenException('Вы не участник этой дуэли');
    const other = duel.players.find((player) => player.userId !== userId);

    const finished = duel.status === 'FINISHED' || duel.status === 'ABANDONED';
    const myGuesses = readGuesses(me.guesses);

    return {
      id: duel.id,
      status: duel.status,
      inviteCode: duel.inviteCode,
      vocabulary: this.semantics.size,

      guesses: [...myGuesses].sort((a, b) => a.rank - b.rank),
      bestRank: me.bestRank,
      solved: me.solvedAt !== null,
      surrendered: me.surrenderedAt !== null,

      opponent: other
        ? {
            userId: other.userId,
            nickname: other.user.nickname,
            avatarUrl: other.user.avatarUrl,
            // Только числа. Слова остаются на сервере — см. заголовок.
            ranks: readGuesses(other.guesses).map((entry) => entry.rank),
            bestRank: other.bestRank,
            guessCount: other.guessCount,
            solved: other.solvedAt !== null,
            surrendered: other.surrenderedAt !== null,
            online: this.online.has(`${duel.id}:${other.userId}`),
          }
        : null,

      winnerId: duel.winnerId,
      word: finished ? duel.word.word : null,
      gloss: finished ? duel.word.gloss : null,
      reward:
        finished && (me.xpEarned > 0 || me.ratingDelta !== 0)
          ? {
              xp: me.xpEarned,
              coins: me.coinsEarned,
              ratingDelta: me.ratingDelta,
              ratingCapped: me.ratingCapped,
            }
          : null,
    };
  }

  /** Десятка ближайших — показывается обоим после конца дуэли. */
  async closest(duelId: string): Promise<HotColdDuelGuess[]> {
    const duel = await this.load(duelId);
    if (duel.status !== 'FINISHED' && duel.status !== 'ABANDONED') return [];
    return this.rankingFor(duel.word)
      .closest(CLOSEST_SHOWN)
      .map((near) => ({ word: near.word, rank: near.rank }));
  }

  // ---- ход ----

  async guess(
    duelId: string,
    userId: string,
    rawGuess: string,
  ): Promise<{
    state: HotColdDuelState;
    rank: number | null;
    understood: string | null;
    repeat: boolean;
  }> {
    const trimmed = rawGuess.trim();
    if (trimmed.length === 0) throw new BadRequestException('Пустой ответ');

    const duel = await this.load(duelId);
    const me = duel.players.find((player) => player.userId === userId);
    if (!me) throw new ForbiddenException('Вы не участник этой дуэли');
    if (duel.status === 'WAITING') {
      throw new BadRequestException('Соперник ещё не пришёл');
    }
    if (duel.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Дуэль уже закончена');
    }

    const resolved = this.semantics.resolve(trimmed);
    if (!resolved) {
      // Неизвестное слово не стоит хода: наказывать за пробелы словаря
      // нечестно, а в гонке это ещё и решало бы исход.
      return {
        state: this.toState(duel, userId),
        rank: null,
        understood: null,
        repeat: false,
      };
    }

    const guesses = readGuesses(me.guesses);
    const already = guesses.find((entry) => entry.word === resolved.word);
    if (already) {
      return {
        state: this.toState(duel, userId),
        rank: already.rank,
        understood: resolved.fix === 'none' ? null : resolved.word,
        repeat: true,
      };
    }

    const rank = this.rankingFor(duel.word).rankOf(resolved.lemma);
    const solved = rank === 1;
    const best = me.bestRank === null ? rank : Math.min(me.bestRank, rank);

    await this.prisma.hotColdDuelPlayer.update({
      where: { id: me.id },
      data: {
        guesses: writeGuesses([...guesses, { word: resolved.word, rank }]),
        guessCount: { increment: 1 },
        bestRank: best,
        // Только проставить, никогда не снять: без этой оговорки любой
        // следующий ход стирал бы отметку о победе.
        ...(solved ? { solvedAt: new Date() } : {}),
      },
    });

    if (solved) await this.finish(duel.id, userId);

    return {
      state: await this.getState(duel.id, userId),
      rank,
      understood: resolved.fix === 'none' ? null : resolved.word,
      repeat: false,
    };
  }

  /** Сдаться: победа уходит сопернику, но это не то же самое, что уйти молча. */
  async surrender(duelId: string, userId: string): Promise<HotColdDuelState> {
    const duel = await this.load(duelId);
    const me = duel.players.find((player) => player.userId === userId);
    if (!me) throw new ForbiddenException('Вы не участник этой дуэли');
    if (duel.status === 'WAITING') {
      // Ждущую дуэль не «сдают», её отменяют — соперника ещё нет.
      await this.prisma.hotColdDuel.updateMany({
        where: { id: duel.id, status: 'WAITING' },
        data: { status: 'ABANDONED', finishedAt: new Date() },
      });
      return this.getState(duel.id, userId);
    }
    if (duel.status !== 'IN_PROGRESS') return this.toState(duel, userId);

    await this.prisma.hotColdDuelPlayer.update({
      where: { id: me.id },
      data: { surrenderedAt: new Date() },
    });
    const other = duel.players.find((player) => player.userId !== userId);
    await this.finish(duel.id, other?.userId ?? null);
    return this.getState(duel.id, userId);
  }

  /**
   * Закрыть дуэль и раздать награды.
   *
   * `updateMany` с условием «ещё идёт» — та самая защита от двойного
   * начисления: два верных слова в одну миллисекунду дадут одну победу и
   * один расчёт, а не два.
   */
  private async finish(duelId: string, winnerId: string | null): Promise<void> {
    const claimed = await this.prisma.hotColdDuel.updateMany({
      where: { id: duelId, status: 'IN_PROGRESS' },
      data: { status: 'FINISHED', winnerId, finishedAt: new Date() },
    });
    if (claimed.count === 0) return;

    const duel = await this.load(duelId);
    for (const player of duel.players) {
      const won = player.userId === winnerId;
      const base = hotColdReward(Math.max(1, player.guessCount), 0);
      const xp = won
        ? base.xp
        : Math.max(1, Math.round(base.xp * HOT_COLD_DUEL_LOSER_SHARE));
      const coins = won
        ? base.coins
        : Math.max(1, Math.round(base.coins * HOT_COLD_DUEL_LOSER_SHARE));
      const ratingDelta = won
        ? HOT_COLD_DUEL_WIN_RATING
        : HOT_COLD_DUEL_LOSS_RATING;

      const applied = await this.usersService.applyGameRewards(player.userId, {
        xpEarned: xp,
        coinsEarned: coins,
        outcome: won ? 'win' : 'loss',
        ratingDelta,
        // Дневной потолок побед — общий с дуэлью по вопросам: иначе двое
        // договорившихся накрутили бы рейтинг за вечер.
        cappedWin: won,
      });

      await this.prisma.hotColdDuelPlayer.update({
        where: { id: player.id },
        data: {
          xpEarned: xp,
          coinsEarned: coins,
          ratingDelta: applied.ratingDelta,
          ratingCapped: applied.ratingCapped,
        },
      });
    }
  }

  // ---- уборка ----

  /**
   * Закрыть то, что уже никому не нужно: никто не пришёл на вызов, или
   * обе стороны ушли, не доиграв.
   *
   * Без этого «активная дуэль» висела бы у игрока вечно и не давала бы
   * начать новую — а он про неё давно забыл.
   */
  async sweepStale(): Promise<number> {
    const now = Date.now();
    const abandoned = await this.prisma.hotColdDuel.updateMany({
      where: {
        OR: [
          {
            status: 'WAITING',
            createdAt: { lt: new Date(now - HOT_COLD_DUEL_WAIT_MS) },
          },
          {
            status: 'IN_PROGRESS',
            startedAt: { lt: new Date(now - HOT_COLD_DUEL_IDLE_MS) },
          },
        ],
      },
      data: { status: 'ABANDONED', finishedAt: new Date() },
    });
    return abandoned.count;
  }
}

/**
 * Догадки обратно в JSON.
 *
 * Prisma принимает в `Json` только простые значения, поэтому раскладываем
 * поля руками. Заодно это единственное место, где задаётся, что именно
 * лежит в базе.
 */
function writeGuesses(guesses: HotColdDuelGuess[]): Prisma.InputJsonValue {
  return guesses.map((entry) => ({ word: entry.word, rank: entry.rank }));
}

/** Разбор с проверкой: испорченная строка не должна ронять экран. */
function readGuesses(value: unknown): HotColdDuelGuess[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is HotColdDuelGuess =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as HotColdDuelGuess).word === 'string' &&
      typeof (entry as HotColdDuelGuess).rank === 'number',
  );
}
