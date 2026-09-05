import { IsString, Length } from 'class-validator';

/** С той стороны сокета — что угодно, поэтому всё входящее проверяется. */
export class HotColdDuelIdDto {
  @IsString()
  @Length(1, 64)
  duelId!: string;
}

export class HotColdDuelGuessDto extends HotColdDuelIdDto {
  @IsString()
  @Length(1, 64)
  guess!: string;
}

export class HotColdDuelLookupDto extends HotColdDuelIdDto {
  @IsString()
  @Length(1, 64)
  word!: string;
}
