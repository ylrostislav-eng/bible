import { IsOptional, IsString, Length } from 'class-validator';

export class JoinRoomDto {
  @IsString()
  @Length(6, 6)
  inviteCode!: string;

  /** Required only when the room is PRIVATE — checked in `RoomsService.join`. */
  @IsOptional()
  @IsString()
  @Length(6, 6)
  password?: string;
}
