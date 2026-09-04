import { Global, Module } from '@nestjs/common';
import { SemanticsService } from './semantics.service';

/**
 * Словарь смыслов нужен нескольким играм сразу, а весит пятнадцать
 * мегабайт — держать его в одном экземпляре на всё приложение и есть
 * смысл этого модуля.
 */
@Global()
@Module({
  providers: [SemanticsService],
  exports: [SemanticsService],
})
export class SemanticsModule {}
