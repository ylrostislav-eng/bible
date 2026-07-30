import {
  SOLO_QUESTION_COUNT_MAX,
  SOLO_QUESTION_COUNT_MIN,
} from '@bible-arena/shared';
import { IsInt, Max, Min } from 'class-validator';

export class CreateDuelDto {
  @IsInt()
  @Min(SOLO_QUESTION_COUNT_MIN)
  @Max(SOLO_QUESTION_COUNT_MAX)
  questionCount!: number;
}
