import { IsInt, Min } from 'class-validator';

export class StartChapterCheckDto {
  @IsInt()
  @Min(1)
  bookId!: number;

  @IsInt()
  @Min(1)
  chapter!: number;
}
