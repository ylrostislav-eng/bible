import {
  DIFFICULTIES,
  SOLO_QUESTION_COUNT_MAX,
  SOLO_QUESTION_COUNT_MIN,
  TESTAMENTS,
  type Difficulty,
  type Testament,
} from '@bible-arena/shared';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class StartSoloGameDto {
  @IsInt()
  @Min(SOLO_QUESTION_COUNT_MIN)
  @Max(SOLO_QUESTION_COUNT_MAX)
  questionCount!: number;

  @IsOptional()
  @IsIn(TESTAMENTS)
  testament?: Testament;

  @IsOptional()
  @IsIn(DIFFICULTIES)
  difficulty?: Difficulty;
}
