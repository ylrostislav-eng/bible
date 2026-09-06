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

  @IsString()
  @IsOptional()
  @MaxLength(500)
  comment?: string;
}
