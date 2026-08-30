import { STREAK_GOAL_OPTIONS, type StreakGoalDays } from '@bible-arena/shared';
import { IsIn } from 'class-validator';

export class SetStreakGoalDto {
  @IsIn(STREAK_GOAL_OPTIONS)
  days!: StreakGoalDays;
}
