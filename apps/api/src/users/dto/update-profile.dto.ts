import {
  COUNTRY_CODES,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  NICKNAME_PATTERN,
  SUPPORTED_LANGUAGES,
  type LanguageCode,
} from '@bible-arena/shared';
import { IsIn, IsOptional, IsUrl, Length, Matches } from 'class-validator';

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
}
