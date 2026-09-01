import { IsString } from 'class-validator';

export class InviteToRoomDto {
  @IsString()
  userId!: string;
}
