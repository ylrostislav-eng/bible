import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReportClientErrorDto {
  @IsString()
  @MaxLength(200)
  kind!: string;

  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsString()
  @IsOptional()
  @MaxLength(8000)
  stack?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  path?: string;

  @IsObject()
  @IsOptional()
  extra?: Record<string, unknown>;
}
