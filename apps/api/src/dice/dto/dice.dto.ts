import {
  DICE_BOT_LEVELS,
  DICE_TARGET_OPTIONS,
  type DiceBotLevel,
} from '@bible-arena/shared';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

/** Секунды на ход: меньше половины минуты — не подумать, больше пяти —
 * уже не таймер, а вечность на том конце. */
const TURN_LIMIT_MIN = 30;
const TURN_LIMIT_MAX = 300;

export class CreateDiceMatchDto {
  @IsOptional()
  @IsIn(DICE_TARGET_OPTIONS, {
    message: 'Такой цели у партии быть не может',
  })
  targetScore?: number;

  /** `null` — без таймера: так играют с друзьями. */
  @IsOptional()
  @IsInt()
  @Min(TURN_LIMIT_MIN)
  @Max(TURN_LIMIT_MAX)
  turnTimeLimit?: number | null;

  @IsOptional()
  @IsBoolean()
  openToMatchmaking?: boolean;
}

export class DiceInviteCodeDto {
  @IsString()
  @Length(4, 12)
  code!: string;
}

export class DiceChallengeDto {
  @IsString()
  friendUserId!: string;

  @IsIn(DICE_TARGET_OPTIONS)
  targetScore!: number;
}

export class DiceChallengeResponseDto {
  @IsIn(['ACCEPT', 'DECLINE'])
  action!: 'ACCEPT' | 'DECLINE';
}

export class DiceFindOpponentDto {
  @IsOptional()
  @IsIn(DICE_TARGET_OPTIONS)
  targetScore?: number;
}

export class CreateDiceSoloDto {
  @IsOptional()
  @IsIn(DICE_TARGET_OPTIONS)
  targetScore?: number;

  @IsIn(DICE_BOT_LEVELS)
  difficulty!: DiceBotLevel;
}

/**
 * Действие игрока.
 *
 * `indexes` — номера костей **в последнем броске**, а не значения: по
 * значениям сервер не смог бы отличить «эта пятёрка» от «та пятёрка», а
 * по номерам проверка однозначна.
 */
export class DiceActionDto {
  @IsIn(['ROLL', 'SELECT', 'BANK', 'CONTINUE', 'RESIGN'])
  type!: 'ROLL' | 'SELECT' | 'BANK' | 'CONTINUE' | 'RESIGN';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(5, { each: true })
  indexes?: number[];

  /** Идентификатор действия — чтобы повтор запроса не сыграл дважды. */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  actionId?: string;

  /** Версия, которую видел игрок при нажатии. Устаревшая команда не
   * применяется к уже изменившемуся столу. */
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}
