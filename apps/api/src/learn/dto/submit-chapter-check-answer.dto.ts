import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SubmitChapterCheckAnswerDto {
  @IsString()
  questionId!: string;

  /** Absent when the client's own countdown ran out before a choice was made. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  answerIndex?: number;
}
