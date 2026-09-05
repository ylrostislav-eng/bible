import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { AbandonedSweeper } from './abandoned.sweeper';
import { DuelController } from './duel.controller';
import { DuelService } from './duel.service';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { QuestionsService } from './questions.service';
import { RoomsController } from './rooms.controller';
import { RoomsGateway } from './rooms.gateway';
import { RoomsService } from './rooms.service';

@Module({
  imports: [UsersModule, NotificationsModule],
  controllers: [GameController, DuelController, RoomsController],
  providers: [
    GameService,
    DuelService,
    QuestionsService,
    RoomsService,
    RoomsGateway,
    AbandonedSweeper,
  ],
})
export class GameModule {}
