import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  ABUSE_REPORT_REASONS,
  type AbuseReportReasonValue,
} from '@bible-arena/shared';

export class CreateReportDto {
  @IsString()
  targetUserId!: string;

  @IsIn(ABUSE_REPORT_REASONS)
  reason!: AbuseReportReasonValue;

  /** Present only when reporting a specific message rather than the player
   * in general — the server copies that message's text into the report so
   * the evidence survives the conversation being deleted. */
  @IsString()
  @IsOptional()
  messageId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  comment?: string;
}
