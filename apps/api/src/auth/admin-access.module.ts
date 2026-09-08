import { Global, Module } from '@nestjs/common';
import { AdminRegistry } from './admin-registry.service';
import { StaffNameMask } from './staff-name-mask.service';

/**
 * Глобальный, потому что ответ «этот человек — администратор» нужен и
 * охраннику эндпоинтов, и профилю, и спискам игроков, и рейтингу. Тащить
 * его импортом в каждый модуль означало бы, что забытый импорт роняет
 * приложение при старте, а добавленный «на всякий случай» — расползается.
 *
 * По той же причине здесь и `StaffNameMask`: имя вырезается в тех же
 * местах, где рисуется значок роли, — то есть почти везде.
 */
@Global()
@Module({
  providers: [AdminRegistry, StaffNameMask],
  exports: [AdminRegistry, StaffNameMask],
})
export class AdminAccessModule {}
