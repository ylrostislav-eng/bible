import { DUEL_QUESTION_COUNT_MIN } from '@bible-arena/shared';
import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class JoinDuelDto {
  @IsString()
  @Length(6, 6)
  inviteCode!: string;

  /** Lets the joiner shrink the host's question count before starting —
   * validated against the host's actual count in `DuelService.join`, since
   * that upper bound isn't known until the session is loaded. */
  @IsOptional()
  @IsInt()
  @Min(DUEL_QUESTION_COUNT_MIN)
  questionCount?: number;
}
