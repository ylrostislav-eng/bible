import {
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { SetGuardianPinDto } from './dto/set-guardian-pin.dto';
import { SetStreakGoalDto } from './dto/set-streak-goal.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** The client sends its `getTimezoneOffset()` on every request; this is
   * the call that persists it, since it runs on every app launch. See
   * `User.timezoneOffsetMinutes` for why the offset has to be stored. */
  @Get('me')
  async getMe(
    @CurrentUser() currentUser: JwtPayload,
    @Headers('x-timezone-offset') timezoneOffset?: string,
  ) {
    const parsed = Number(timezoneOffset);
    const user = await this.usersService.touchActivity(
      currentUser.sub,
      Number.isFinite(parsed) && timezoneOffset ? parsed : undefined,
    );
    return this.usersService.toProfile(user);
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    const user = await this.usersService.updateProfile(currentUser.sub, dto);
    return this.usersService.toProfile(user);
  }

  /** Sets, changes or clears the guardian PIN. Throttled well below the
   * app-wide budget: this endpoint takes PIN guesses, and the per-account
   * counter in the service is the second line rather than the only one. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Patch('me/guardian-pin')
  async setGuardianPin(
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: SetGuardianPinDto,
  ) {
    const user = await this.usersService.setGuardianPin(
      currentUser.sub,
      dto.pin,
      dto.currentPin,
    );
    return this.usersService.toProfile(user);
  }

  @Get('leaderboard')
  async getLeaderboard(@CurrentUser() currentUser: JwtPayload) {
    return this.usersService.getLeaderboard(currentUser.sub);
  }

  @Patch('me/streak-goal')
  async setStreakGoal(
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: SetStreakGoalDto,
  ) {
    const user = await this.usersService.setStreakGoal(
      currentUser.sub,
      dto.days,
    );
    return this.usersService.toProfile(user);
  }
}
