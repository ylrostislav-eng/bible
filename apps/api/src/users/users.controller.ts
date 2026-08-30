import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { SetStreakGoalDto } from './dto/set-streak-goal.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@CurrentUser() currentUser: JwtPayload) {
    const user = await this.usersService.touchActivity(currentUser.sub);
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
