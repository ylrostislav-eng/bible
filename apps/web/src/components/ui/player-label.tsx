import { displayName, isNameHidden, isStaffRole, type AppRole } from '@bible-arena/shared';
import { RoleBadge } from './role-badge';

/**
 * Имя игрока в строке — или значок роли вместо него.
 *
 * Гейм-мастер и администраторы могут скрыть имя: тогда сервер вообще не
 * присылает никнейм, а на его месте встаёт значок. Смысл не в приватности,
 * а в узнавании — «Game-Master» отвечает на вопрос «кто это» лучше, чем
 * любой ник.
 *
 * Одно место на всё приложение, потому что мест показа имени полтора
 * десятка: списки, поиск, заявки, рейтинг, лобби, табло. Написанное в
 * каждом по-своему, это разошлось бы на первой же правке — где-то остался
 * бы пустой «Игрок» вместо значка, и заметить это можно было бы только
 * глазами, зайдя тем самым аккаунтом.
 */
export function PlayerLabel({
  nickname,
  role,
  className,
  badgeSize = 'sm',
}: {
  nickname: string | null | undefined;
  role?: AppRole | null;
  className?: string;
  badgeSize?: 'sm' | 'md';
}) {
  if (isNameHidden(nickname, role)) {
    return <RoleBadge role={role} size={badgeSize} className={className} />;
  }
  return <span className={className}>{displayName(nickname, role)}</span>;
}

/**
 * Подпись под именем: значок роли или обычный титул.
 *
 * Здесь значок стоит вместо титула — у служебных ролей он и есть титул.
 * Но когда имя скрыто, значок уже занял место имени, и второй такой же
 * строкой ниже читается как ошибка вёрстки. В этом случае возвращается
 * титул, как у всех.
 */
export function RoleOrTitle({
  nickname,
  role,
  title,
}: {
  nickname: string | null | undefined;
  role?: AppRole | null;
  title: string;
}) {
  if (isNameHidden(nickname, role)) return <>{title}</>;
  return isStaffRole(role) ? <RoleBadge role={role} /> : <>{title}</>;
}
