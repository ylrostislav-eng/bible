import {
  DUEL_QUESTION_COUNT_MAX,
  DUEL_QUESTION_COUNT_MIN,
  ROOM_MAX_PARTICIPANTS,
  type RoomVisibility,
} from '@bible-arena/shared';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRoomDto {
  @IsIn(['PUBLIC', 'PRIVATE'])
  visibility!: RoomVisibility;

  @IsInt()
  @Min(DUEL_QUESTION_COUNT_MIN)
  @Max(DUEL_QUESTION_COUNT_MAX)
  questionCount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  roomName?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(ROOM_MAX_PARTICIPANTS)
  maxParticipants?: number;
}
