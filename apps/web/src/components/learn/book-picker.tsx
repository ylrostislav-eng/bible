'use client';

import { BIBLE_BOOKS } from '@bible-arena/shared';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const BOOKS_BY_ORDER = [...BIBLE_BOOKS].sort((a, b) => a.order - b.order);

interface BookPickerProps {
  /** Что читают сейчас — подсвечивается и к нему прокручен список. */
  bookId: number;
  chapter: number;
  onSelect: (bookId: number, chapter: number) => void;
  onClose: () => void;
}

/**
 * Выбор книги и главы прямо из читалки.
 *
 * ## Зачем понадобился
 *
 * Читалка стала открываться на последнем прочитанном месте — и оказалось,
 * что уйти из него некуда: чтобы добраться до другой книги, надо было
 * догадаться нажать стрелку «назад», попасть в главы, оттуда ещё раз
 * назад — и только там список книг. Дорога есть, но она невидима, а
 * выглядит это как «Библия открылась на одной книге и всё».
 *
 * Поэтому название главы стало кнопкой: нажал — вот все книги.
 *
 * ## Почему главы раскрываются внутри списка, а не отдельным экраном
 *
 * Так видно, где ты находишься: список остаётся на месте, под выбранной
 * книгой разворачивается сетка глав. Отдельный экран отвечал бы на вопрос
 * «какая глава», но терял ответ на вопрос «а какие ещё книги рядом», ради
 * которого сюда и пришли.
 *
 * ## Мелочь, без которой всё бесполезно
 *
 * Список открывается **прокрученным к текущей книге**. Шестьдесят шесть
 * названий — это несколько экранов; без прокрутки человек, читающий
 * Второзаконие, каждый раз начинал бы поиск с Бытия.
 */
export function BookPicker({ bookId, chapter, onSelect, onClose }: BookPickerProps) {
  // Раскрыта ли книга. Сразу разворачиваем ту, что читают: чаще всего
  // сюда заходят за соседней главой той же книги.
  const [openBookId, setOpenBookId] = useState<number | null>(bookId);
  const currentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // `block: 'center'`, а не 'start': книга посередине экрана даёт видеть
    // и то, что до неё, и то, что после, — то есть сразу понятно, куда
    // листать.
    currentRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  // Порталом в `body`, а не по месту в разметке.
  //
  // Экран обёрнут в анимацию перехода, а любая трансформация создаёт свой
  // слой: `z-50` внутри него не перебивает `z-30` снаружи, и плавающие
  // кнопки музыки и чата проступали поверх панели. Живая проверка это и
  // показала — по коду слои выглядели правильными.
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-label="Выбор книги">
      <div className="flex items-center gap-3 border-b border-border px-4 pt-safe pb-3">
        <button
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-text-secondary"
          aria-label="Закрыть выбор книги"
        >
          ✕
        </button>
        <h2 className="text-lg font-bold">Книги</h2>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(var(--safe-bottom)+6rem)]">
        {[
          { title: 'Ветхий Завет', books: BOOKS_BY_ORDER.filter((b) => b.testament === 'OLD') },
          { title: 'Новый Завет', books: BOOKS_BY_ORDER.filter((b) => b.testament === 'NEW') },
        ].map((section) => (
          <div key={section.title} className="pt-4">
            <h3 className="px-1 pb-2 text-sm font-semibold text-text-secondary">{section.title}</h3>
            {section.books.map((book) => {
              const isCurrent = book.id === bookId;
              const isOpen = book.id === openBookId;
              return (
                <div key={book.id} ref={isCurrent ? currentRef : undefined}>
                  <button
                    onClick={() => setOpenBookId(isOpen ? null : book.id)}
                    aria-expanded={isOpen}
                    className={clsx(
                      'flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm',
                      isCurrent ? 'font-bold text-primary' : 'font-medium',
                      isOpen && 'bg-surface',
                    )}
                  >
                    <span className="min-w-0 truncate">{book.name}</span>
                    <span className="ml-3 shrink-0 text-xs text-text-muted">
                      {isOpen ? '▲' : `${book.chapters} гл.`}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="grid grid-cols-5 gap-2 px-1 pt-1 pb-3">
                      {Array.from({ length: book.chapters }, (_, i) => i + 1).map((n) => (
                        <button
                          key={n}
                          onClick={() => onSelect(book.id, n)}
                          className={clsx(
                            'flex h-11 items-center justify-center rounded-xl border text-sm font-semibold',
                            isCurrent && n === chapter
                              ? 'border-primary bg-primary text-on-primary'
                              : 'border-border bg-surface text-text-primary',
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
