import { IsString, MinLength } from 'class-validator';

export class TelegramLoginDto {
  @IsString()
  @MinLength(1)
  initData!: string;
}
