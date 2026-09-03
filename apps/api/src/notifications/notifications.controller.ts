import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { NotificationsService } from './notifications.service';
import { RemindersService } from './reminders.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly remindersService: RemindersService,
  ) {}

  /** Runs the reminder sweep now instead of waiting for its timer. Admin
   * only — it sends real messages to real people. Exists so the schedule
   * can be checked deliberately rather than by watching a clock. */
  @UseGuards(AdminGuard)
  @Post('reminders/sweep')
  sweepReminders() {
    return this.remindersService.sweep();
  }

  @Get('decline-notices')
  listDeclineNotices(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.listDeclineNotices(user.sub);
  }

  @Delete('decline-notices/:id')
  async dismissDeclineNotice(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    await this.notificationsService.dismissDeclineNotice(user.sub, id);
  }
}
