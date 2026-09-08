import { Global, Module } from '@nestjs/common';
import { AdminRegistry } from './admin-registry.service';

/**
 * Глобальный, потому что ответ «этот человек — администратор» нужен и
 * охраннику эндпоинтов, и профилю, и спискам игроков, и рейтингу. Тащить
 * его импортом в каждый модуль означало бы, что забытый импорт роняет
 * приложение при старте, а добавленный «на всякий случай» — расползается.
 */
@Global()
@Module({
  providers: [AdminRegistry],
  exports: [AdminRegistry],
})
export class AdminAccessModule {}
