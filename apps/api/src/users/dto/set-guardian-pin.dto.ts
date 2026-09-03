import { GUARDIAN_PIN_PATTERN } from '@bible-arena/shared';
import { IsOptional, Matches, ValidateIf } from 'class-validator';

export class SetGuardianPinDto {
  /** The new PIN, or `null` to remove the existing one. */
  @ValidateIf((o: SetGuardianPinDto) => o.pin !== null)
  @Matches(GUARDIAN_PIN_PATTERN, { message: 'PIN-код — 4 цифры' })
  pin!: string | null;

  /** Required whenever a PIN is already set — see `setGuardianPin`. */
  @IsOptional()
  @Matches(GUARDIAN_PIN_PATTERN, { message: 'PIN-код — 4 цифры' })
  currentPin?: string;
}
