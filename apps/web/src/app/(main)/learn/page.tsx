'use client';

import type { BibleChapterResponse } from '@bible-arena/shared';
import { BIBLE_BOOKS } from '@bible-arena/shared';
import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'react';
import { LearnIcon } from '@/components/icons/nav-icons';
import { Card } from '@/components/ui/card';
import { ApiError, apiClient } from '@/lib/api';

type View = 'books' | 'chapters' | 'reader';

const OLD_TESTAMENT_BOOKS = BIBLE_BOOKS.filter((b) => b.testament === 'OLD');
const NEW_TESTAMENT_BOOKS = BIBLE_BOOKS.filter((b) => b.testament === 'NEW');

function BooksView({ onSelectBook }: { onSelectBook: (bookId: number) => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-6">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface">
          <LearnIcon className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Изучение</h1>
          <p className="text-sm text-text-secondary">Синодальный перевод</p>
        </div>
      </div>

      {[
        { title: 'Ветхий Завет', books: OLD_TESTAMENT_BOOKS },
        { title: 'Новый Завет', books: NEW_TESTAMENT_BOOKS },
      ].map((section) => (
        <div key={section.title} className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-semibold text-text-secondary">{section.title}</h2>
          <Card className="flex-col gap-0.5 p-2">
            {section.books.map((book) => (
              <button
                key={book.id}
                onClick={() => onSelectBook(book.id)}
                className="flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium hover:bg-surface-hover"
              >
                <span>{book.name}</span>
                <span className="text-xs text-text-muted">{book.chapters} гл.</span>
              </button>
            ))}
          </Card>
        </div>
      ))}
    </div>
  );
}

function ChaptersView({
  bookId,
  onSelectChapter,
  onBack,
}: {
  bookId: number;
  onSelectChapter: (chapter: number) => void;
  onBack: () => void;
}) {
  const book = BIBLE_BOOKS.find((b) => b.id === bookId);
  if (!book) return null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-text-secondary"
          aria-label="Назад к книгам"
        >
          ←
        </button>
        <h1 className="text-lg font-bold">{book.name}</h1>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: book.chapters }, (_, i) => i + 1).map((chapter) => (
          <button
            key={chapter}
            onClick={() => onSelectChapter(chapter)}
            className="flex h-11 items-center justify-center rounded-xl border border-border bg-surface text-sm font-semibold text-text-primary hover:bg-surface-hover"
          >
            {chapter}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReaderView({
  bookId,
  chapter,
  onBackToChapters,
  onNavigate,
}: {
  bookId: number;
  chapter: number;
  onBackToChapters: () => void;
  onNavigate: (bookId: number, chapter: number) => void;
}) {
  const [data, setData] = useState<BibleChapterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get<BibleChapterResponse>(`/bible/${bookId}/${chapter}`);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Не удалось загрузить главу');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [bookId, chapter]);

  const goPrev = useCallback(() => {
    if (chapter > 1) {
      onNavigate(bookId, chapter - 1);
      return;
    }
    const bookIndex = BIBLE_BOOKS.findIndex((b) => b.id === bookId);
    const prevBook = BIBLE_BOOKS[bookIndex - 1];
    if (prevBook) onNavigate(prevBook.id, prevBook.chapters);
  }, [bookId, chapter, onNavigate]);

  const goNext = useCallback(() => {
    const book = BIBLE_BOOKS.find((b) => b.id === bookId);
    if (!book) return;
    if (chapter < book.chapters) {
      onNavigate(bookId, chapter + 1);
      return;
    }
    const bookIndex = BIBLE_BOOKS.findIndex((b) => b.id === bookId);
    const nextBook = BIBLE_BOOKS[bookIndex + 1];
    if (nextBook) onNavigate(nextBook.id, 1);
  }, [bookId, chapter, onNavigate]);

  const isVeryFirst = bookId === BIBLE_BOOKS[0].id && chapter === 1;
  const isVeryLast =
    bookId === BIBLE_BOOKS[BIBLE_BOOKS.length - 1].id &&
    chapter === BIBLE_BOOKS[BIBLE_BOOKS.length - 1].chapters;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6 pb-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onBackToChapters}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-text-secondary"
          aria-label="Назад к главам"
        >
          ←
        </button>
        <h1 className="text-lg font-bold">{data ? `${data.bookName} ${data.chapter}` : '…'}</h1>
      </div>

      {loading && <p className="text-center text-sm text-text-secondary">Загрузка…</p>}
      {error && <p className="text-center text-sm text-danger">{error}</p>}

      {data && (
        <Card className="flex-col gap-3">
          <p className="text-base leading-relaxed">
            {data.verses.map((v) => (
              <span key={v.verse}>
                <sup className="mr-1 text-xs font-semibold text-text-muted">{v.verse}</sup>
                {v.text}{' '}
              </span>
            ))}
          </p>
        </Card>
      )}

      <div className="flex gap-3">
        <button
          onClick={goPrev}
          disabled={isVeryFirst}
          className={clsx(
            'h-11 flex-1 rounded-xl border border-border bg-surface text-sm font-semibold',
            isVeryFirst ? 'opacity-40' : 'hover:bg-surface-hover',
          )}
        >
          ← Пред. глава
        </button>
        <button
          onClick={goNext}
          disabled={isVeryLast}
          className={clsx(
            'h-11 flex-1 rounded-xl border border-border bg-surface text-sm font-semibold',
            isVeryLast ? 'opacity-40' : 'hover:bg-surface-hover',
          )}
        >
          След. глава →
        </button>
      </div>
    </div>
  );
}

export default function LearnPage() {
  const [view, setView] = useState<View>('books');
  const [bookId, setBookId] = useState<number | null>(null);
  const [chapter, setChapter] = useState<number | null>(null);

  if (view === 'chapters' && bookId !== null) {
    return (
      <ChaptersView
        bookId={bookId}
        onSelectChapter={(c) => {
          setChapter(c);
          setView('reader');
        }}
        onBack={() => setView('books')}
      />
    );
  }

  if (view === 'reader' && bookId !== null && chapter !== null) {
    return (
      <ReaderView
        bookId={bookId}
        chapter={chapter}
        onBackToChapters={() => setView('chapters')}
        onNavigate={(nextBookId, nextChapter) => {
          setBookId(nextBookId);
          setChapter(nextChapter);
        }}
      />
    );
  }

  return (
    <BooksView
      onSelectBook={(id) => {
        setBookId(id);
        setView('chapters');
      }}
    />
  );
}
