import { DUEL_QUESTION_COUNT_MIN } from '@bible-arena/shared';
import type { RespondToChallengeAction } from '@bible-arena/shared';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class RespondToChallengeDto {
  @IsIn(['ACCEPT', 'DECLINE'])
  action!: RespondToChallengeAction;

  @IsOptional()
  @IsInt()
  @Min(DUEL_QUESTION_COUNT_MIN)
  questionCount?: number;
}
