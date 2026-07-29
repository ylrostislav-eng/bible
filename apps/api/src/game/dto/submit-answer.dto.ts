import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SubmitAnswerDto {
  @IsString()
  questionId!: string;

  @IsInt()
  @Min(0)
  @Max(3)
  answerIndex!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  timeTakenMs?: number;
}
