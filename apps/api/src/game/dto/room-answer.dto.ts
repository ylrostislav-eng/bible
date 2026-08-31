import { IsInt, IsString, Max, Min } from 'class-validator';

export class RoomAnswerDto {
  @IsString()
  questionId!: string;

  @IsInt()
  @Min(0)
  @Max(3)
  answerIndex!: number;
}
