import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { LearnController } from './learn.controller';
import { LearnService } from './learn.service';

@Module({
  imports: [UsersModule],
  controllers: [LearnController],
  providers: [LearnService],
})
export class LearnModule {}
