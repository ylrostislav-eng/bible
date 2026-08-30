import {
  DUEL_QUESTION_COUNT_MAX,
  DUEL_QUESTION_COUNT_MIN,
} from '@bible-arena/shared';
import { IsInt, IsString, Max, Min } from 'class-validator';

export class ChallengeFriendDto {
  @IsString()
  friendUserId!: string;

  @IsInt()
  @Min(DUEL_QUESTION_COUNT_MIN)
  @Max(DUEL_QUESTION_COUNT_MAX)
  questionCount!: number;
}
