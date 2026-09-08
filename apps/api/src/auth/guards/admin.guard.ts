import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { GAME_MASTER_ONLY_MESSAGE } from '@bible-arena/shared';
import type { Request } from 'express';
import { AdminRegistry } from '../admin-registry.service';

/**
 * Пускает к экрану управления: гейм-мастера и администраторов. Ставится
 * **после** `JwtAuthGuard`, иначе `request.user` ещё пуст и охранник
 * откажет всем.
 *
 * Сам список не разбирает — спрашивает `AdminRegistry`: тот же ответ
 * нужен профилю и спискам, и два разбора одних переменных окружения рано
 * или поздно разошлись бы.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly admins: AdminRegistry) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!this.admins.isStaff(request.user?.telegramId)) {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}

/**
 * Второй рубеж — для необратимого: удаления аккаунта, правки чужого
 * баланса, рассылки. Отдельным охранником, а не проверкой внутри метода:
 * проверку в теле метода забывают, охранник над методом виден глазом при
 * чтении контроллера.
 */
@Injectable()
export class GameMasterGuard implements CanActivate {
  constructor(private readonly admins: AdminRegistry) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!this.admins.isGameMaster(request.user?.telegramId)) {
      throw new ForbiddenException(GAME_MASTER_ONLY_MESSAGE);
    }
    return true;
  }
}
