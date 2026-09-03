import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  ALIAS_CATEGORIES,
  ALIAS_DECK_MAX_COUNT,
  ALIAS_DIFFICULTIES,
  ALIAS_TESTAMENTS,
  type AliasCategory,
  type AliasDifficulty,
  type AliasTestament,
} from '@bible-arena/shared';

/** Приходит из query-строки, поэтому всё — строки: `?categories=PERSON,PLACE`
 * или повторяющийся параметр. Принимаем оба вида, чтобы клиент мог собрать
 * ссылку любым привычным способом. */
function toList(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export class GetAliasDeckDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(ALIAS_DECK_MAX_COUNT)
  count?: number;

  /** Отсутствие уровня — это смешанная колода, а не ошибка. */
  @IsOptional()
  @IsIn(ALIAS_DIFFICULTIES)
  difficulty?: AliasDifficulty;

  @IsOptional()
  @Transform(({ value }) => toList(value))
  @IsArray()
  @IsIn(ALIAS_CATEGORIES, { each: true })
  categories?: AliasCategory[];

  @IsOptional()
  @Transform(({ value }) => toList(value))
  @IsArray()
  @IsIn(ALIAS_TESTAMENTS, { each: true })
  testaments?: AliasTestament[];
}
