import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ALIAS_CATEGORIES,
  ALIAS_DIFFICULTIES,
  ALIAS_MAX_TEAMS,
  ALIAS_MIN_TEAMS,
  ALIAS_TESTAMENTS,
  type AliasCategory,
  type AliasDifficulty,
  type AliasTestament,
} from '@bible-arena/shared';

export const ALIAS_TEAM_NAME_MAX = 24;

/**
 * Управляющие символы (`Cc`) и невидимые форматирующие (`Cf`): нулевой
 * ширины, метки направления письма, BOM. В поле ввода их не видно, а в
 * списке партий они переворачивают строку задом наперёд. Через категории
 * Unicode, а не через диапазон кодов: в исходнике не остаётся невидимых
 * символов, которые нельзя ни прочитать, ни надёжно отредактировать.
 */
const INVISIBLE_CHARS = /[\p{Cc}\p{Cf}]/gu;

/** Имя команды печатают за столом, второпях, иногда ребёнок. Чистим то, что
 * ломает вёрстку, и оставляем всё остальное — это имя видит только своя же
 * компания, и придираться к нему не за чем. */
function cleanTeamName(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value
    .replace(INVISIBLE_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ALIAS_TEAM_NAME_MAX);
}

export class AliasTeamResultDto {
  @Transform(({ value }) => cleanTeamName(value))
  @IsString()
  @Length(1, ALIAS_TEAM_NAME_MAX)
  name!: string;

  /** Счёт может уйти в минус: штраф за пропуск это позволяет, и подрезать
   * его до нуля значило бы соврать про партию, которая так и закончилась. */
  @IsInt()
  @Min(-999)
  @Max(999)
  score!: number;
}

export class AliasSettingsDto {
  @IsInt()
  @Min(10)
  @Max(300)
  roundSeconds!: number;

  @IsInt()
  @Min(5)
  @Max(200)
  targetScore!: number;

  @IsIn([0, 1])
  skipPenalty!: 0 | 1;

  @IsBoolean()
  lastWordAfterBell!: boolean;

  @IsOptional()
  @IsIn(ALIAS_DIFFICULTIES)
  difficulty?: AliasDifficulty | null;

  @IsArray()
  @IsIn(ALIAS_CATEGORIES, { each: true })
  categories!: AliasCategory[];

  @IsArray()
  @IsIn(ALIAS_TESTAMENTS, { each: true })
  testaments!: AliasTestament[];

  @IsBoolean()
  soundEnabled!: boolean;
}

export class SaveAliasMatchDto {
  @IsArray()
  @ArrayMinSize(ALIAS_MIN_TEAMS)
  @ArrayMaxSize(ALIAS_MAX_TEAMS)
  @ValidateNested({ each: true })
  @Type(() => AliasTeamResultDto)
  teams!: AliasTeamResultDto[];

  @IsInt()
  @Min(1)
  @Max(500)
  roundsPlayed!: number;

  @ValidateNested()
  @Type(() => AliasSettingsDto)
  settings!: AliasSettingsDto;
}
