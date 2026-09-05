import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  HOT_COLD_DUEL_AWAY_MS,
  HOT_COLD_DUEL_COUNTDOWN_MS,
  HOT_COLD_DUEL_IDLE_MS,
  HOT_COLD_DUEL_LOSER_SHARE,
  HOT_COLD_DUEL_LOSS_RATING,
  HOT_COLD_DUEL_MAX_GUESSES,
  HOT_COLD_DUEL_POINTS_SHARE,
  HOT_COLD_DUEL_SECONDS_PER_GUESS,
  HOT_COLD_DUEL_WAIT_MS,
  HOT_COLD_DUEL_WIN_RATING,
  HOT_COLD_SECRET_COMMON_LIMIT,
  HOT_COLD_SECRET_MIN_EPISODES,
  hotColdHeat,
  hotColdReward,
  type HotColdDuelGuess,
  type HotColdDuelState,
} from '@bible-arena/shared';
import { blockedWith, MATCH_ATTEMPTS } from '../common/matchmaking';
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
  /**
   * Когда игрок пропал со связи. Живёт в памяти, а не в базе, намеренно:
   * это сведение о текущем соединении, оно теряет смысл при перезапуске
   * сервера, и хранить его дольше самого соединения незачем. Цена
   * перезапуска — отсчёт «соперник ушёл» начнётся заново, что честно: с
   * точки зрения нового процесса никто никуда ещё не уходил.
   */
  private readonly awaySince = new Map<string, number>();
  /**
   * Когда у игрока сгорит текущее слово. Ключ: `${duelId}:${userId}`.
   *
   * Тоже в памяти: часы идут, пока живёт процесс, а после перезапуска
   * отсчёт начинается заново — это лучше, чем сжечь человеку слова за
   * время, которого он не видел.
   */
  private readonly deadlines = new Map<string, number>();

  // ---- часы ----

  /** Пустить отсчёт на слово заново. */
  armDeadline(duelId: string, userId: string): number {
    const at = Date.now() + HOT_COLD_DUEL_SECONDS_PER_GUESS * 1000;
    this.deadlines.set(`${duelId}:${userId}`, at);
    return at;
  }

  clearDeadline(duelId: string, userId: string): void {
    this.deadlines.delete(`${duelId}:${userId}`);
  }

  /**
   * Слово сгорело: не успели за отведённые секунды.
   *
   * Возвращает, случилось ли списание, и закончилась ли на этом партия —
   * шлюзу нужно и то и другое: первое чтобы сказать игроку, второе чтобы
   * остановить часы.
   */
  async burnGuess(
    duelId: string,
    userId: string,
  ): Promise<{ burnt: boolean; finished: boolean }> {
    const duel = await this.load(duelId);
    if (duel.status !== 'IN_PROGRESS') return { burnt: false, finished: true };
    const me = duel.players.find((player) => player.userId === userId);
    if (!me || me.guessCount >= HOT_COLD_DUEL_MAX_GUESSES) {
      return { burnt: false, finished: false };
    }

    await this.prisma.hotColdDuelPlayer.update({
      where: { id: me.id },
      data: { guessCount: { increment: 1 } },
    });

    // Сгоревшее слово — такой же расход, как написанное: если у обоих
    // слова кончились, партия должна закончиться и здесь, а не ждать,
    // пока кто-нибудь что-нибудь наберёт.
    const other = duel.players.find((player) => player.userId !== userId);
    const mineLeft = HOT_COLD_DUEL_MAX_GUESSES - (me.guessCount + 1);
    const hisLeft = HOT_COLD_DUEL_MAX_GUESSES - (other?.guessCount ?? 0);
    if (mineLeft <= 0 && hisLeft <= 0) {
      await this.finish(
        duelId,
        closerOf([
          { userId, bestRank: me.bestRank },
          { userId: other?.userId ?? '', bestRank: other?.bestRank ?? null },
        ]),
      );
      return { burnt: true, finished: true };
    }
    return { burnt: true, finished: mineLeft <= 0 };
  }

  // ---- присутствие ----

  setOnline(duelId: string, userId: string, present: boolean): void {
    const key = `${duelId}:${userId}`;
    if (present) {
      this.online.add(key);
      this.awaySince.delete(key);
    } else {
      this.online.delete(key);
      // Отсчёт начинаем один раз: повторный обрыв уже отсутствующего
      // соединения не должен обнулять ожидание.
      if (!this.awaySince.has(key)) this.awaySince.set(key, Date.now());
    }
  }

  /** Достаточно ли долго нет соперника, чтобы забрать победу. */
  private isAway(duelId: string, userId: string): boolean {
    const since = this.awaySince.get(`${duelId}:${userId}`);
    return since !== undefined && Date.now() - since >= HOT_COLD_DUEL_AWAY_MS;
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
  async create(
    userId: string,
    targetUserId?: string,
    openToMatchmaking = false,
  ): Promise<string> {
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
        openToMatchmaking,
        wordId: word.id,
        players: { create: { userId } },
      },
    });
    return duel.id;
  }

  /**
   * Найти соперника — незнакомца, а не друга по коду.
   *
   * Очередь тут не отдельная сущность, а сами ожидающие партии: одна из
   * них уже есть, у неё есть владелец, её видно, и уборка для неё
   * написана. Заводить рядом «билеты» значило бы завести и все способы их
   * рассинхронизировать с партиями.
   *
   * Возвращает id партии и сел ли игрок к сопернику или ждёт сам, —
   * экрану надо показать разное.
   */
  async findOpponent(
    userId: string,
  ): Promise<{ duelId: string; matched: boolean }> {
    const mine = await this.activeFor(userId);
    if (mine) return { duelId: mine, matched: false };

    const blocked = await blockedWith(this.prisma, userId);

    for (let attempt = 0; attempt < MATCH_ATTEMPTS; attempt += 1) {
      const waiting = await this.prisma.hotColdDuel.findFirst({
        where: {
          status: 'WAITING',
          openToMatchmaking: true,
          targetUserId: null,
          // Ни своя партия, ни партия того, с кем мы друг друга не хотим
          // видеть. Второе — в обе стороны: иначе заблокировавший всё
          // равно окажется в партии со мной, просто по моей инициативе.
          players: {
            none: { userId: { in: [userId, ...blocked] } },
          },
        },
        // Кто дольше ждёт, тот и получает соперника: иначе при живой
        // очереди самый первый ждал бы дольше всех.
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!waiting) break;

      try {
        return {
          duelId: await this.joinDuel(userId, waiting.id),
          matched: true,
        };
      } catch {
        // Кто-то сел раньше — пробуем следующую. Без этого проигравший
        // гонку остался бы ни с чем, хотя рядом могла ждать другая.
        continue;
      }
    }

    return {
      duelId: await this.create(userId, undefined, true),
      matched: false,
    };
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
      select: { id: true },
    });
    if (!duel) throw new NotFoundException('Дуэль по такому коду не найдена');
    return this.joinDuel(userId, duel.id);
  }

  /**
   * Сесть вторым в ожидающую партию.
   *
   * Общий путь для входа по коду и для подбора: правила одинаковы, и
   * разъехаться они не должны. Особенно это касается атомарного захвата —
   * повторить его во втором месте и однажды забыть слишком легко.
   */
  private async joinDuel(userId: string, duelId: string): Promise<string> {
    const duel = await this.prisma.hotColdDuel.findUnique({
      where: { id: duelId },
      include: { players: true },
    });
    if (!duel) throw new NotFoundException('Дуэль не найдена');
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
    // Партия не начинается сама: сначала оба говорят «готов». Раньше она
    // стартовала в ту же секунду, когда заходил второй, и часы шли, пока
    // человек ещё читал, что происходит на экране.
    const claimed = await this.prisma.hotColdDuel.updateMany({
      where: { id: duel.id, status: 'WAITING' },
      data: { status: 'READY_CHECK' },
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
      // Открыта ли партия для подбора, экран знать обязан: ожидание «сейчас
      // подберём незнакомца» и ожидание «продиктуйте код другу» выглядят
      // одинаково, а означают разное. Держать это на клиенте нельзя —
      // перезагрузка страницы стёрла бы, чем всё началось.
      open: duel.openToMatchmaking,
      vocabulary: this.semantics.size,

      youReady: me.readyAt !== null,
      // Момент старта отдаётся, только пока он в будущем: после старта
      // экрану про него знать нечего, а «отсчёт закончился» он определит
      // по тому, что поле исчезло, а не по своим часам.
      startsAt:
        duel.startsAt && duel.startsAt.getTime() > Date.now()
          ? duel.startsAt.toISOString()
          : null,

      guesses: [...myGuesses].sort((a, b) => a.rank - b.rank),
      bestRank: me.bestRank,
      guessesLeft: Math.max(0, HOT_COLD_DUEL_MAX_GUESSES - me.guessCount),
      serverNow: new Date().toISOString(),
      deadlineAt:
        duel.status === 'IN_PROGRESS' &&
        me.guessCount < HOT_COLD_DUEL_MAX_GUESSES
          ? (() => {
              const at = this.deadlines.get(`${duel.id}:${userId}`);
              return at === undefined ? null : new Date(at).toISOString();
            })()
          : null,
      solved: me.solvedAt !== null,
      surrendered: me.surrenderedAt !== null,

      // Забрать победу можно только в идущей партии и только когда
      // соперник действительно есть и действительно пропал.
      canClaimWin:
        duel.status === 'IN_PROGRESS' &&
        other !== undefined &&
        this.isAway(duel.id, other.userId),

      opponent: other
        ? {
            userId: other.userId,
            nickname: other.user.nickname,
            avatarUrl: other.user.avatarUrl,
            // Только числа. Слова остаются на сервере — см. заголовок.
            ranks: readGuesses(other.guesses).map((entry) => entry.rank),
            bestRank: other.bestRank,
            guessCount: other.guessCount,
            guessesLeft: Math.max(
              0,
              HOT_COLD_DUEL_MAX_GUESSES - other.guessCount,
            ),
            solved: other.solvedAt !== null,
            surrendered: other.surrenderedAt !== null,
            ready: other.readyAt !== null,
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
    if (duel.status === 'READY_CHECK') {
      throw new BadRequestException('Партия ещё не началась');
    }
    if (duel.startsAt && duel.startsAt.getTime() > Date.now()) {
      // Отсчёт «3-2-1» — часть партии, а не заставка: слово, отправленное
      // до старта, дало бы фору тому, кто успел набрать заранее.
      throw new BadRequestException('Идёт отсчёт — вот-вот начнём');
    }
    if (duel.status !== 'IN_PROGRESS') {
      // Ход в законченную дуэль — не ошибка игрока, а гонка: он дожал
      // Enter в ту секунду, когда соперник нашёл слово. Сказать надо, что
      // случилось, а не «нельзя».
      const rival = duel.players.find((player) => player.userId !== userId);
      throw new BadRequestException(
        rival?.solvedAt
          ? 'Соперник нашёл слово первым — дуэль закончена'
          : 'Дуэль уже закончена',
      );
    }

    if (me.guessCount >= HOT_COLD_DUEL_MAX_GUESSES) {
      throw new BadRequestException(
        'Слова кончились — ждём, чем ответит соперник',
      );
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

    if (solved) {
      await this.finish(duel.id, userId);
    } else {
      // Слова кончились у обоих — партию пора кончать. Считаем по свежим
      // числам, а не по тем, что лежали в `duel`: свой счётчик мы только
      // что увеличили.
      const other = duel.players.find((player) => player.userId !== userId);
      const mineLeft = HOT_COLD_DUEL_MAX_GUESSES - (me.guessCount + 1);
      const hisLeft = HOT_COLD_DUEL_MAX_GUESSES - (other?.guessCount ?? 0);
      if (mineLeft <= 0 && hisLeft <= 0) {
        await this.finish(
          duel.id,
          closerOf([
            { userId, bestRank: best },
            {
              userId: other?.userId ?? '',
              bestRank: other?.bestRank ?? null,
            },
          ]),
        );
      }
    }

    return {
      state: await this.getState(duel.id, userId),
      rank,
      understood: resolved.fix === 'none' ? null : resolved.word,
      repeat: false,
    };
  }

  /**
   * «Я готов». Когда готовы оба — пускается отсчёт и начинается партия.
   *
   * Момент старта пишется в базу, а не держится в памяти: до него не
   * принимаются ходы и не заводятся часы на слово, и это должно пережить и
   * перезагрузку страницы, и переподключение сокета, и второй открытый
   * экран. Держать такое в памяти процесса значит получить две разные
   * правды у двух игроков.
   *
   * Флаг ставится только один раз: снять «готов» нельзя — иначе появляется
   * способ тянуть время, а соперник сидит и ждёт неизвестно чего.
   */
  async setReady(duelId: string, userId: string): Promise<HotColdDuelState> {
    const duel = await this.load(duelId);
    const me = duel.players.find((player) => player.userId === userId);
    if (!me) throw new ForbiddenException('Вы не участник этой дуэли');
    if (duel.status !== 'READY_CHECK') return this.toState(duel, userId);

    if (!me.readyAt) {
      await this.prisma.hotColdDuelPlayer.update({
        where: { id: me.id },
        data: { readyAt: new Date() },
      });
    }

    const other = duel.players.find((player) => player.userId !== userId);
    if (other?.readyAt) {
      // `updateMany` с условием «ещё проверка готовности»: двое, нажавших
      // «готов» в одну миллисекунду, иначе назначили бы два разных старта,
      // и у каждого на экране был бы свой отсчёт.
      await this.prisma.hotColdDuel.updateMany({
        where: { id: duel.id, status: 'READY_CHECK' },
        data: {
          status: 'IN_PROGRESS',
          startsAt: new Date(Date.now() + HOT_COLD_DUEL_COUNTDOWN_MS),
          startedAt: new Date(),
        },
      });
    }
    return this.getState(duelId, userId);
  }

  /** Кто играет — шлюзу, чтобы завести часы обоим после отсчёта. */
  async playerIds(duelId: string): Promise<string[]> {
    const players = await this.prisma.hotColdDuelPlayer.findMany({
      where: { duelId },
      select: { userId: true },
    });
    return players.map((player) => player.userId);
  }

  /** Когда партия начнётся, если отсчёт ещё идёт. */
  async startsAt(duelId: string): Promise<Date | null> {
    const duel = await this.prisma.hotColdDuel.findUnique({
      where: { id: duelId },
      select: { status: true, startsAt: true },
    });
    if (!duel || duel.status !== 'IN_PROGRESS') return null;
    return duel.startsAt && duel.startsAt.getTime() > Date.now()
      ? duel.startsAt
      : null;
  }

  /** Сдаться: победа уходит сопернику, но это не то же самое, что уйти молча. */
  async surrender(duelId: string, userId: string): Promise<HotColdDuelState> {
    const duel = await this.load(duelId);
    const me = duel.players.find((player) => player.userId === userId);
    if (!me) throw new ForbiddenException('Вы не участник этой дуэли');
    if (duel.status === 'WAITING' || duel.status === 'READY_CHECK') {
      // Ждущую дуэль не «сдают», её отменяют — соперника ещё нет. То же и
      // на проверке готовности: игра не началась, ходов не было, и
      // назначать за это поражение не за что.
      await this.prisma.hotColdDuel.updateMany({
        where: { id: duel.id, status: duel.status },
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
   * Забрать победу, когда соперник ушёл и не вернулся.
   *
   * Проверка «его нет достаточно долго» стоит на сервере, а не на кнопке:
   * кнопку можно нажать откуда угодно и когда угодно, и без этой проверки
   * победа доставалась бы тому, кто быстрее сообразил её потребовать.
   */
  async claimWin(duelId: string, userId: string): Promise<HotColdDuelState> {
    const duel = await this.load(duelId);
    const me = duel.players.find((player) => player.userId === userId);
    if (!me) throw new ForbiddenException('Вы не участник этой дуэли');
    if (duel.status !== 'IN_PROGRESS') return this.toState(duel, userId);

    const other = duel.players.find((player) => player.userId !== userId);
    if (!other || !this.isAway(duelId, other.userId)) {
      throw new BadRequestException('Соперник на связи — доигрывайте партию');
    }
    await this.finish(duelId, userId);
    return this.getState(duelId, userId);
  }

  /**
   * Закрыть дуэль и раздать награды.
   *
   * `winnerId === null` здесь означает **ничью**, а не «никто»: у дуэли
   * всегда есть исход, и «никакого исхода» — это как раз то, чем можно
   * злоупотребить, просто закрыв вкладку.
   *
   * `updateMany` с условием «ещё идёт» — защита от двойного начисления:
   * два верных слова в одну миллисекунду дадут одну победу и один расчёт,
   * а не два.
   */
  private async finish(duelId: string, winnerId: string | null): Promise<void> {
    const claimed = await this.prisma.hotColdDuel.updateMany({
      where: { id: duelId, status: 'IN_PROGRESS' },
      data: { status: 'FINISHED', winnerId, finishedAt: new Date() },
    });
    if (claimed.count === 0) return;
    // Часы больше не нужны: без этого сгоревшее слово могло бы списаться
    // уже после конца партии.
    for (const key of [...this.deadlines.keys()]) {
      if (key.startsWith(`${duelId}:`)) this.deadlines.delete(key);
    }

    const duel = await this.load(duelId);
    const best = hotColdReward(1, 0);
    // Слово нашлось — победа в чистую, полные очки. Победа без
    // разгаданного слова — половина, и под это одно правило подходят все
    // случаи сразу: у обоих кончились слова, соперник сдался, соперник
    // ушёл. Во всех трёх слово осталось неразгаданным.
    const knockout = duel.players.some((player) => player.solvedAt !== null);
    const share = knockout ? 1 : HOT_COLD_DUEL_POINTS_SHARE;
    for (const player of duel.players) {
      const drew = winnerId === null;
      const won = !drew && player.userId === winnerId;
      // Победителю — как в обычной партии: он доиграл, и число его попыток
      // честно говорит, насколько хорошо.
      //
      // Проигравшему — по тому, насколько близко он подошёл, а не по числу
      // попыток. Причина в самом устройстве гонки: его оборвали на
      // произвольном ходе, и счётчик попыток к качеству его игры уже не
      // относится. Хуже того, считать по нему значило бы платить тем
      // меньше, чем дольше человек думал.
      //
      // Близость берётся той же логарифмической мерой, что и полоска
      // тепла: у неё уже есть обоснование, и второй шкалы для того же
      // самого заводить незачем.
      const closeness =
        player.bestRank === null ? 0 : hotColdHeat(player.bestRank);
      const xp = won
        ? Math.max(
            1,
            Math.round(
              hotColdReward(Math.max(1, player.guessCount), 0).xp * share,
            ),
          )
        : Math.max(
            1,
            Math.round(best.xp * HOT_COLD_DUEL_LOSER_SHARE * closeness),
          );
      const coins = won
        ? Math.max(
            1,
            Math.round(
              hotColdReward(Math.max(1, player.guessCount), 0).coins * share,
            ),
          )
        : Math.max(
            1,
            Math.round(best.coins * HOT_COLD_DUEL_LOSER_SHARE * closeness),
          );
      // За ничью рейтинг не двигается вовсе, а поражение без единого хода
      // не наказывается: человек мог зайти ровно в тот момент, когда
      // соперник дописывал слово, и отнимать за это очки не за что.
      const ratingDelta = won
        ? Math.max(1, Math.round(HOT_COLD_DUEL_WIN_RATING * share))
        : drew || player.guessCount === 0
          ? 0
          : // Знак сохраняем руками: `Math.round(-2.5)` даёт −2, и
            // полагаться на округление отрицательных чисел здесь значит
            // однажды удивиться.
            -Math.max(1, Math.round(-HOT_COLD_DUEL_LOSS_RATING * share));

      const applied = await this.usersService.applyGameRewards(player.userId, {
        xpEarned: xp,
        coinsEarned: coins,
        outcome: won ? 'win' : drew ? 'draw' : 'loss',
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

    // Никто не пришёл на вызов — это не партия, и исхода у неё нет.
    const never = await this.prisma.hotColdDuel.updateMany({
      where: {
        // И та, где второй зашёл, но «готов» так и не нажал: ходов не
        // было, наград нет, исхода нет.
        status: { in: ['WAITING', 'READY_CHECK'] },
        createdAt: { lt: new Date(now - HOT_COLD_DUEL_WAIT_MS) },
      },
      data: { status: 'ABANDONED', finishedAt: new Date() },
    });

    // А вот начатую партию нельзя просто закрыть «вничью по умолчанию»:
    // это открытая дверь для проигрывающего — закрыл вкладку, подождал
    // полчаса, и минус рейтинга нет, а честный соперник не получил свой
    // плюс. Поэтому брошенная партия решается по существу: побеждает тот,
    // кто подошёл ближе, а при равенстве это настоящая ничья.
    const stalled = await this.prisma.hotColdDuel.findMany({
      where: {
        status: 'IN_PROGRESS',
        startedAt: { lt: new Date(now - HOT_COLD_DUEL_IDLE_MS) },
      },
      select: {
        id: true,
        players: { select: { userId: true, bestRank: true } },
      },
    });
    for (const duel of stalled) {
      await this.finish(duel.id, closerOf(duel.players));
    }

    return never.count + stalled.length;
  }
}

/**
 * Кто из двоих подошёл ближе. `null` — поровну, то есть ничья.
 *
 * Ни одного хода ни у кого — тоже ничья: сравнивать нечего, и назначать
 * победителя монеткой хуже, чем честно сказать «ничья».
 */
function closerOf(
  players: { userId: string; bestRank: number | null }[],
): string | null {
  const ranked = players.filter((player) => player.bestRank !== null);
  if (ranked.length === 0) return null;
  if (ranked.length === 1) return ranked[0].userId;
  const [first, second] = [...ranked].sort(
    (a, b) => (a.bestRank as number) - (b.bestRank as number),
  );
  return first.bestRank === second.bestRank ? null : first.userId;
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
