import { IsBoolean, IsInt, IsString, Max, Min } from 'class-validator';

/** Every room WebSocket message carries at least a session id — the events
 * below extend this instead of repeating the field. */
export class RoomSessionIdDto {
  @IsString()
  sessionId!: string;
}

export class RoomReadyDto extends RoomSessionIdDto {
  @IsBoolean()
  ready!: boolean;
}

/** Shared by `room:kick` and `room:ban` — both just name a target participant. */
export class RoomTargetUserDto extends RoomSessionIdDto {
  @IsString()
  userId!: string;
}

export class RoomAnswerMessageDto extends RoomSessionIdDto {
  @IsString()
  questionId!: string;

  @IsInt()
  @Min(0)
  @Max(3)
  answerIndex!: number;
}
