import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { DuelController } from './duel.controller';
import { DuelService } from './duel.service';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { QuestionsService } from './questions.service';
import { RoomsController } from './rooms.controller';
import { RoomsGateway } from './rooms.gateway';
import { RoomsService } from './rooms.service';

@Module({
  imports: [UsersModule],
  controllers: [GameController, DuelController, RoomsController],
  providers: [
    GameService,
    DuelService,
    QuestionsService,
    RoomsService,
    RoomsGateway,
  ],
})
export class GameModule {}
