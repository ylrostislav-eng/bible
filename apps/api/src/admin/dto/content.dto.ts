import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ALIAS_CATEGORIES,
  ALIAS_TESTAMENTS,
  CONTENT_ACCEPTS_MAX,
  CONTENT_EXPLANATION_MAX,
  CONTENT_GLOSS_MAX,
  CONTENT_KINDS,
  CONTENT_OPTION_MAX,
  CONTENT_TEXT_MAX,
  CONTENT_WORD_MAX,
  DIFFICULTIES,
  QUESTION_OPTIONS_COUNT,
  TESTAMENTS,
  type AliasCategory,
  type AliasTestament,
  type ContentKind,
  type Difficulty,
  type Testament,
} from '@bible-arena/shared';

/**
 * Одно тело на все три вида содержимого.
 *
 * Разделять его на три DTO пришлось бы вместе с тремя маршрутами, а вид
 * приходит параметром пути и всё равно проверяется в сервисе — там же, где
 * лежат правила, которые классом-валидатором не выразить (четыре
 * непустых варианта без повторов, верный ответ внутри списка, место в
 * Писании целиком или никак).
 *
 * Здесь остаются проверки формы: типы, длины, допустимые значения
 * перечислений. Их задача — не пустить в сервис мусор, а не заменить его
 * проверки.
 */
export class ContentPatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_TEXT_MAX)
  text?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(QUESTION_OPTIONS_COUNT)
  @IsString({ each: true })
  @MaxLength(CONTENT_OPTION_MAX, { each: true })
  options?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(QUESTION_OPTIONS_COUNT - 1)
  correctIndex?: number;

  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_EXPLANATION_MAX)
  explanation?: string;

  /** У вопроса завет — OLD/NEW, у слова добавляется BOTH. Один список
   * здесь и разбор по виду в сервисе: два поля с почти одинаковым
   * смыслом путали бы клиента сильнее, чем помогали. */
  @IsOptional()
  @IsIn([...TESTAMENTS, ...ALIAS_TESTAMENTS])
  testament?: Testament | AliasTestament;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  book?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  chapter?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(66)
  bookId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  verses?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  topic?: string | null;

  /** Три ступени и у вопроса, и у слова: списки значений совпадают
   * (`EASY`/`MEDIUM`/`HARD`), поэтому тип здесь один. */
  @IsOptional()
  @IsIn(DIFFICULTIES)
  difficulty?: Difficulty;

  @IsOptional()
  @IsBoolean()
  draft?: boolean;

  // ---- слово ----

  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_WORD_MAX)
  word?: string;

  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_GLOSS_MAX)
  gloss?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CONTENT_ACCEPTS_MAX)
  @IsString({ each: true })
  @MaxLength(CONTENT_WORD_MAX, { each: true })
  accepts?: string[];

  @IsOptional()
  @IsIn(ALIAS_CATEGORIES)
  category?: AliasCategory;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(66)
  refBookId?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  refChapter?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  refVerse?: number | null;
}

/** Вид содержимого приходит в пути; отдельный класс — чтобы проверка была
 * такой же, как у тела, а не «строкой, которую мы надеемся узнать». */
export class ContentKindParamDto {
  @IsIn(CONTENT_KINDS)
  kind!: ContentKind;
}

export class ContentItemParamDto extends ContentKindParamDto {
  @IsString()
  id!: string;
}
