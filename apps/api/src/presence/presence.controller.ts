import { Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { PresenceService } from './presence.service';

@UseGuards(JwtAuthGuard)
@Controller('presence')
export class PresenceController {
  constructor(private readonly presenceService: PresenceService) {}

  /** Called periodically by the client while the app is open, to keep the
   * user's presence TTL from expiring — see `PresenceService`. */
  @Post('ping')
  async ping(@CurrentUser() user: JwtPayload): Promise<{ ok: true }> {
    await this.presenceService.markOnline(user.sub);
    return { ok: true };
  }
}
