import { Module } from '@nestjs/common';
import { AliasController } from './alias.controller';
import { AliasService } from './alias.service';

@Module({
  controllers: [AliasController],
  providers: [AliasService],
})
export class AliasModule {}
