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

  /**
   * `Date.prototype.getTimezoneOffset()` from the client, sent so the daily
   * streak can be evaluated against the player's own calendar day instead
   * of UTC's — someone far from UTC could otherwise lose or fail to earn a
   * streak day purely because their consistent local routine falls on the
   * "wrong" side of a UTC midnight that has nothing to do with their actual
   * day. Absent (or out of range) falls back to UTC, matching the old
   * behavior — never a hard failure over a missing timezone.
   */
  @IsOptional()
  @IsInt()
  @Min(-720)
  @Max(840)
  timezoneOffsetMinutes?: number;
}
