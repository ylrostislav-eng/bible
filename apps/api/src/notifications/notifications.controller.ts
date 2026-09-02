import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { NotificationsService } from './notifications.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

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
