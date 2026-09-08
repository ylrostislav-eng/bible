import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  ADMIN_BALANCE_MAX_DELTA,
  ADMIN_BALANCE_MIN_DELTA,
  ADMIN_BROADCAST_AUDIENCES,
  ADMIN_BROADCAST_MAX_LENGTH,
  ADMIN_MUTE_MAX_HOURS,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  type AdminBroadcastAudience,
} from '@bible-arena/shared';

export class MutePlayerDto {
  @IsInt()
  @Min(1)
  @Max(ADMIN_MUTE_MAX_HOURS)
  hours!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class RenamePlayerDto {
  @IsString()
  @MinLength(NICKNAME_MIN_LENGTH)
  @MaxLength(NICKNAME_MAX_LENGTH)
  nickname!: string;
}

export class AdjustBalanceDto {
  @IsOptional()
  @IsInt()
  @Min(ADMIN_BALANCE_MIN_DELTA)
  @Max(ADMIN_BALANCE_MAX_DELTA)
  coins?: number;

  @IsOptional()
  @IsInt()
  @Min(ADMIN_BALANCE_MIN_DELTA)
  @Max(ADMIN_BALANCE_MAX_DELTA)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class DeletePlayerDto {
  /** Ник целиком — подтверждение необратимого действия. */
  @IsString()
  @MaxLength(NICKNAME_MAX_LENGTH)
  confirmNickname!: string;
}

export class BroadcastDto {
  @IsIn(ADMIN_BROADCAST_AUDIENCES)
  audience!: AdminBroadcastAudience;

  @IsString()
  @MinLength(1)
  @MaxLength(ADMIN_BROADCAST_MAX_LENGTH)
  text!: string;
}

export class BroadcastPreviewDto {
  @IsIn(ADMIN_BROADCAST_AUDIENCES)
  audience!: AdminBroadcastAudience;
}
