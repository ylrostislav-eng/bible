import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ALIAS_DECK_DEFAULT_COUNT,
  ALIAS_DECK_MAX_COUNT,
  formatAliasReference,
  type AliasDeckResponse,
  type AliasMatchView,
  type AliasTeamResult,
  type AliasWordView,
} from '@bible-arena/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import type { GetAliasDeckDto } from './dto/get-alias-deck.dto';
import type { SaveAliasMatchDto } from './dto/save-alias-match.dto';

/**
 * Сколько последних выданных слов помним, чтобы не подсовывать их снова.
 * Держится примерно в размер банка: помнить меньше — и повторы полезут уже
 * во второй партии за вечер, помнить больше — и «свежих» слов не остаётся
 * вовсе, а список растёт без пользы.
 */
const RECENT_WORDS_LIMIT = 400;

/** Неделя: к следующим выходным та же компания уже забыла половину слов, и
 * держать список дальше значит бесконечно сужать себе колоду. */
const RECENT_WORDS_TTL_SECONDS = 7 * 24 * 60 * 60;

const MATCH_HISTORY_LIMIT = 30;

@Injectable()
export class AliasService {
  private readonly logger = new Logger(AliasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Фильтры экрана настройки, переведённые в условие выборки. Пустой
   * список категорий или заветов трактуется как «все»: пользователь снял
   * последнюю галочку, и отдать ему пустую колоду вместо полной — худшее из
   * прочтений этого жеста. */
  private buildFilter(dto: GetAliasDeckDto): Prisma.AliasWordWhereInput {
    const where: Prisma.AliasWordWhereInput = {};
    if (dto.difficulty) where.difficulty = dto.difficulty;
    if (dto.categories && dto.categories.length > 0) {
      where.category = { in: dto.categories };
    }
    if (dto.testaments && dto.testaments.length > 0) {
      where.testament = { in: dto.testaments };
    }
    return where;
  }

  async countAvailable(dto: GetAliasDeckDto): Promise<{ available: number }> {
    const available = await this.prisma.aliasWord.count({
      where: this.buildFilter(dto),
    });
    return { available };
  }

  /**
   * Выдаёт колоду на всю партию сразу.
   *
   * Порядок такой: сначала слова, которых игрок ещё не видел, потом, если
   * не хватило, — виденные. Отдать короткую колоду было бы честнее по
   * форме, но на практике означало бы «партия оборвалась на середине», а
   * это худшее, что может случиться с игрой за столом. Поэтому колода
   * всегда полная, а сколько в ней свежего — сказано отдельным числом,
   * и экран может предложить снять фильтр.
   */
  async getDeck(
    userId: string,
    dto: GetAliasDeckDto,
  ): Promise<AliasDeckResponse> {
    const where = this.buildFilter(dto);
    const requested = Math.min(
      dto.count ?? ALIAS_DECK_DEFAULT_COUNT,
      ALIAS_DECK_MAX_COUNT,
    );

    const candidates = await this.prisma.aliasWord.findMany({
      where,
      select: {
        id: true,
        word: true,
        difficulty: true,
        category: true,
        gloss: true,
        refBookId: true,
        refChapter: true,
        refVerse: true,
      },
    });

    const recent = await this.readRecent(userId);
    const unseen = candidates.filter((word) => !recent.has(word.id));
    const seen = candidates.filter((word) => recent.has(word.id));
    shuffle(unseen);
    shuffle(seen);

    const deck = [...unseen, ...seen].slice(0, requested);
    const fresh = deck.filter((word) => !recent.has(word.id)).length;

    await this.rememberIssued(
      userId,
      deck.map((word) => word.id),
    );

    return {
      words: deck.map((word) => toWordView(word)),
      available: candidates.length,
      fresh,
    };
  }

  async saveMatch(
    userId: string,
    dto: SaveAliasMatchDto,
  ): Promise<AliasMatchView> {
    const teams: AliasTeamResult[] = dto.teams.map((team) => ({
      name: team.name,
      score: team.score,
    }));

    const match = await this.prisma.aliasMatch.create({
      data: {
        hostUserId: userId,
        teams: teams as unknown as Prisma.InputJsonValue,
        winnerName: pickWinner(teams),
        roundsPlayed: dto.roundsPlayed,
        settings: dto.settings as unknown as Prisma.InputJsonValue,
      },
    });

    return toMatchView(match);
  }

  async listMatches(userId: string): Promise<AliasMatchView[]> {
    const matches = await this.prisma.aliasMatch.findMany({
      where: { hostUserId: userId },
      orderBy: { playedAt: 'desc' },
      take: MATCH_HISTORY_LIMIT,
    });
    return matches.map((match) => toMatchView(match));
  }

  async getMatch(userId: string, matchId: string): Promise<AliasMatchView> {
    const match = await this.prisma.aliasMatch.findFirst({
      where: { id: matchId, hostUserId: userId },
    });
    if (!match) throw new NotFoundException('Партия не найдена');
    return toMatchView(match);
  }

  // ---- «недавно виденные» ----
  //
  // Живёт в Redis, а не в базе: это подсказка для перемешивания, а не
  // данные. Потеря списка стоит игроку одной партии с повторами — а
  // отдельная таблица на каждое показанное слово стоила бы записи в базу
  // на каждый раунд в каждой компании.

  private recentKey(userId: string): string {
    return `alias:recent:${userId}`;
  }

  private async readRecent(userId: string): Promise<Set<string>> {
    try {
      const ids = await this.redis.client.lrange(
        this.recentKey(userId),
        0,
        RECENT_WORDS_LIMIT - 1,
      );
      return new Set(ids);
    } catch (error) {
      // Без Redis игра должна начаться всё равно: худшее, что случится, —
      // слова повторятся чаще обычного.
      this.logger.warn(
        `Не удалось прочитать историю слов Alias: ${(error as Error).message}`,
      );
      return new Set();
    }
  }

  private async rememberIssued(
    userId: string,
    wordIds: string[],
  ): Promise<void> {
    if (wordIds.length === 0) return;
    try {
      const key = this.recentKey(userId);
      await this.redis.client
        .multi()
        .lpush(key, ...wordIds)
        .ltrim(key, 0, RECENT_WORDS_LIMIT - 1)
        .expire(key, RECENT_WORDS_TTL_SECONDS)
        .exec();
    } catch (error) {
      this.logger.warn(
        `Не удалось запомнить выданные слова Alias: ${(error as Error).message}`,
      );
    }
  }
}

interface AliasWordRow {
  id: string;
  word: string;
  difficulty: AliasWordView['difficulty'];
  category: AliasWordView['category'];
  gloss: string;
  refBookId: number | null;
  refChapter: number | null;
  refVerse: number | null;
}

function toWordView(row: AliasWordRow): AliasWordView {
  const { refBookId, refChapter, refVerse } = row;
  // Три поля заполняются вместе или не заполняются вовсе, но проверяем все
  // три: ссылка на половину места хуже, чем её отсутствие.
  const label =
    refBookId !== null && refChapter !== null && refVerse !== null
      ? formatAliasReference(refBookId, refChapter, refVerse)
      : null;

  return {
    id: row.id,
    word: row.word,
    difficulty: row.difficulty,
    category: row.category,
    gloss: row.gloss,
    reference:
      label !== null
        ? {
            bookId: refBookId!,
            chapter: refChapter!,
            verse: refVerse!,
            label,
          }
        : null,
  };
}

interface AliasMatchRow {
  id: string;
  teams: Prisma.JsonValue;
  winnerName: string | null;
  roundsPlayed: number;
  playedAt: Date;
}

function toMatchView(match: AliasMatchRow): AliasMatchView {
  return {
    id: match.id,
    teams: match.teams as unknown as AliasTeamResult[],
    winnerName: match.winnerName,
    roundsPlayed: match.roundsPlayed,
    playedAt: match.playedAt.toISOString(),
  };
}

/**
 * Победитель — команда с наибольшим счётом; при равенстве победителя нет.
 * Ничья в Alias бывает: круг доигрывается до конца, и две команды вполне
 * могут перевалить за цель на одном и том же числе. Назначить одну из них
 * победителем «по порядку в списке» значит соврать компании, которая
 * только что видела табло своими глазами.
 */
function pickWinner(teams: AliasTeamResult[]): string | null {
  if (teams.length === 0) return null;
  const best = Math.max(...teams.map((team) => team.score));
  const leaders = teams.filter((team) => team.score === best);
  return leaders.length === 1 ? leaders[0].name : null;
}

/** Тасование Фишера — Йетса. `sort(() => Math.random() - 0.5)` даёт заметно
 * неравномерный порядок, а в колоде это видно: одни и те же слова всё время
 * оказываются в начале. */
function shuffle<T>(items: T[]): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}
