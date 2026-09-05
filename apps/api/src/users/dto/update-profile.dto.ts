import {
  AGE_BANDS,
  QUESTION_PACES,
  TEXT_SCALES,
  COUNTRY_CODES,
  GUARDIAN_PIN_PATTERN,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  NICKNAME_PATTERN,
  SOUND_VOLUME_MAX,
  SOUND_VOLUME_MIN,
  SUPPORTED_LANGUAGES,
  type AgeBand,
  type LanguageCode,
  type QuestionPace,
  type TextScale,
} from '@bible-arena/shared';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsUrl,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @Length(NICKNAME_MIN_LENGTH, NICKNAME_MAX_LENGTH)
  @Matches(NICKNAME_PATTERN, {
    message: 'Nickname may only contain letters, digits, and underscores',
  })
  nickname?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  avatarUrl?: string | null;

  @IsOptional()
  @IsIn(COUNTRY_CODES)
  country?: string | null;

  @IsOptional()
  @IsIn(SUPPORTED_LANGUAGES)
  language?: LanguageCode;

  @IsOptional()
  @IsIn(AGE_BANDS)
  ageBand?: AgeBand;

  /** Only read when `ageBand` moves the account out of the child mode and a
   * guardian PIN is set. */
  @IsOptional()
  @Matches(GUARDIAN_PIN_PATTERN, { message: 'PIN-код — 4 цифры' })
  guardianPin?: string;

  @IsOptional()
  @IsBoolean()
  guardianConfirmed?: boolean;

  @IsOptional()
  @IsBoolean()
  remindersEnabled?: boolean;

  @IsOptional()
  @IsIn(QUESTION_PACES)
  questionPace?: QuestionPace;

  @IsOptional()
  @IsIn(TEXT_SCALES)
  textScale?: TextScale;

  @IsOptional()
  @IsBoolean()
  soundEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  musicEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(SOUND_VOLUME_MIN)
  @Max(SOUND_VOLUME_MAX)
  musicVolume?: number;

  @IsOptional()
  @IsBoolean()
  hapticsEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(SOUND_VOLUME_MIN)
  @Max(SOUND_VOLUME_MAX)
  soundVolume?: number;
}
