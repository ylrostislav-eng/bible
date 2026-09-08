'use client';

import { CONTENT_KIND_LABELS, isStaffRole, type ContentKind } from '@bible-arena/shared';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ContentEditor } from './content-editor';

/**
 * Карандаш прямо у вопроса или слова — правка там, где замечена ошибка.
 *
 * Ради этого всё и затевалось: тот, кто видит опечатку, видит её в
 * партии с телефона, а не в списке на компьютере. Дорога «запомнить,
 * дойти до управления, найти поиском» не проходится — забывается на
 * первом же шаге.
 *
 * ## Что здесь важно
 *
 * - **Не видно никому, кроме своих.** Игрок карандаша не встретит; сервер
 *   при этом всё равно проверит права — спрятанная кнопка это удобство,
 *   а не защита.
 * - **Партия не рвётся.** Панель открывается порталом поверх экрана;
 *   таймер под ней продолжает идти, и это осознанно: правка занимает
 *   минуту, а прерывать чужую дуэль ради опечатки нельзя. Правящий это
 *   видит — предупреждение стоит прямо в панели.
 * - **Порталом в `body`, а не на месте.** Экраны обёрнуты в анимацию
 *   перехода, и любой `transform` на обёртке сделал бы её собственным
 *   слоем: «полноэкранная» панель тогда окажется под плавающими
 *   кнопками. На этом здесь уже обжигались (см. чеклист).
 */
export function ContentEditButton({
  kind,
  id,
  role,
  label = 'Поправить',
}: {
  kind: ContentKind;
  id: string;
  /** Роль текущего игрока — приходит из профиля, чтобы кнопка не делала
   * своего запроса на каждом вопросе. */
  role: string | null | undefined;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!isStaffRole(role as never)) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${label}: ${CONTENT_KIND_LABELS[kind]}`}
        className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-surface-hover px-2.5 text-xs font-medium text-text-secondary transition active:text-text-primary"
      >
        <PencilIcon />
        {label}
      </button>

      {open && <ContentEditSheet kind={kind} id={id} onClose={() => setOpen(false)} />}
    </>
  );
}

function ContentEditSheet({
  kind,
  id,
  onClose,
}: {
  kind: ContentKind;
  id: string;
  onClose: () => void;
}) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3 pb-3 sm:items-center">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border p-3">
          <p className="text-sm font-bold">{CONTENT_KIND_LABELS[kind]}</p>
          <button onClick={onClose} className="text-sm text-text-secondary">
            Закрыть
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {/* Честно про то, что происходит за панелью: партия идёт, и
              таймер вопроса не остановился. */}
          <p className="mb-3 rounded-lg bg-surface-hover p-2 text-xs text-text-muted">
            Партия продолжается, пока вы правите. Правка увидится в новых партиях; текущая
            доиграется на старом тексте.
          </p>
          <ContentEditor kind={kind} id={id} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path
        d="m4 20 4-1 10-10-3-3L5 16l-1 4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="m15 6 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
