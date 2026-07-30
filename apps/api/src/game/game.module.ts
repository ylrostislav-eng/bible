import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { DuelController } from './duel.controller';
import { DuelService } from './duel.service';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { QuestionsService } from './questions.service';

@Module({
  imports: [UsersModule],
  controllers: [GameController, DuelController],
  providers: [GameService, DuelService, QuestionsService],
})
export class GameModule {}
