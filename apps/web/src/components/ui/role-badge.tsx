import { isStaffRole, type AppRole } from '@bible-arena/shared';
import clsx from 'clsx';

/**
 * Значок роли — он же титул для тех, у кого есть права.
 *
 * Стоит там, где у всех остальных стоит титул («Ищущий», «Читающий»), и
 * заменяет его собой: у гейм-мастера и администраторов не появляется
 * лишней строки, а место, куда смотрят с вопросом «кто это», отвечает
 * сразу.
 *
 * ## Почему два разных вида, а не один с другим словом
 *
 * Гейм-мастер один, администраторов несколько — и это должно читаться
 * раньше, чем прочитано слово. Поэтому золото с короной досталось
 * единственной роли, а администраторам — спокойная сталь со щитом: два
 * золотых значка рядом сделали бы их равными на вид, и «главный здесь»
 * пришлось бы вычитывать буквами.
 *
 * Отсюда же и блик: он есть только у гейм-мастера и только один раз при
 * появлении. Постоянная анимация в списке из пятидесяти строк — это
 * мельтешение, а не выделение.
 *
 * Ник при этом остаётся на месте. Заменять ником слово «гейм-мастер» —
 * значит лишить человека имени в списках, в комнатах и на табло дуэли,
 * где по имени и узнают, с кем играют.
 */
export function RoleBadge({
  role,
  size = 'sm',
  className,
}: {
  role: AppRole | null | undefined;
  size?: 'sm' | 'md';
  className?: string;
}) {
  if (!isStaffRole(role)) return null;

  const master = role === 'GAME_MASTER';

  return (
    <span
      className={clsx(
        'role-badge',
        master ? 'role-badge-master' : 'role-badge-admin',
        size === 'md' && 'role-badge-md',
        className,
      )}
      // Читалке экрана заглавные читаются по буквам; произносим словом.
      aria-label={master ? 'Game-Master' : 'Администратор'}
    >
      {master ? <CrownIcon /> : <ShieldIcon />}
      {/* Латиницей и в том написании, которое выбрал владелец: это имя
          роли, а не перевод. Рядом с русским «АДМИН» разница в алфавите
          работает на ту же цель, что и золото против стали, — роли не
          путаются. */}
      <span aria-hidden>{master ? 'Game-Master' : 'АДМИН'}</span>
    </span>
  );
}

function CrownIcon() {
  return (
    <svg viewBox="0 0 24 24" className="role-badge-icon" aria-hidden>
      <path d="M3 8.2 6.8 11 12 4.4 17.2 11 21 8.2 19.3 18H4.7L3 8.2Z" fill="currentColor" />
      <rect x="4.7" y="19" width="14.6" height="2.2" rx="1.1" fill="currentColor" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" className="role-badge-icon" aria-hidden>
      <path
        d="M12 2.5 20 6v6.2c0 4.6-3.2 7.9-8 9.3-4.8-1.4-8-4.7-8-9.3V6l8-3.5Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path d="m10.6 14.6-2.3-2.3 1.3-1.3 1 1 3.8-3.8 1.3 1.3-5.1 5.1Z" fill="var(--color-bg)" />
    </svg>
  );
}
