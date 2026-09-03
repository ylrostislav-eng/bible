'use client';

import { ALIAS_TEAM_COLORS } from '@bible-arena/shared';
import clsx from 'clsx';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { AliasRoundItem } from '@/lib/alias/match-state';
import { pluralPoints } from '@/lib/plural';

interface ReviewScreenProps {
  teamName: string;
  teamIndex: number;
  items: AliasRoundItem[];
  gained: number;
  onToggle: (index: number) => void;
  onConfirm: () => void;
}

/**
 * Разбор раунда. Единственный экран, где спор за столом («это же считается!»,
 * «ты сказал однокоренное») решается одним нажатием, а не пересчётом вслух.
 * Поэтому переключение стоит ровно один тап по строке, а счёт пересчитывается
 * тут же — компания видит цену своего решения до того, как согласится.
 */
export function AliasReviewScreen({
  teamName,
  teamIndex,
  items,
  gained,
  onToggle,
  onConfirm,
}: ReviewScreenProps) {
  const color = ALIAS_TEAM_COLORS[teamIndex % ALIAS_TEAM_COLORS.length];
  const guessed = items.filter((item) => item.guessed).length;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-28 pt-6">
      <header className="flex flex-col gap-1">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden
          />
          {teamName}
        </span>
        <h1 className="text-2xl font-bold">
          {gained > 0 ? '+' : ''}
          {gained} {pluralPoints(Math.abs(gained))}
        </h1>
        <p className="text-sm text-text-secondary">
          {items.length === 0
            ? 'В этом раунде не было ни одного слова'
            : `Угадано ${guessed} из ${items.length}. Нажмите на слово, если решили иначе.`}
        </p>
      </header>

      <ul className="flex flex-col gap-2">
        {items.map((item, index) => (
          <ReviewRow
            key={`${item.word.id}-${index}`}
            item={item}
            onToggle={() => onToggle(index)}
          />
        ))}
      </ul>

      <div className="pb-safe fixed inset-x-0 bottom-0 border-t border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto max-w-md px-4 py-3">
          <Button onClick={onConfirm}>Записать в счёт</Button>
        </div>
      </div>
    </div>
  );
}

function ReviewRow({ item, onToggle }: { item: AliasRoundItem; onToggle: () => void }) {
  const [open, setOpen] = useState(false);
  const { word } = item;

  return (
    <li className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={item.guessed}
          className="flex flex-1 items-center gap-3 px-3 py-3 text-left"
        >
          <span
            className={clsx(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold transition',
              item.guessed ? 'bg-success text-bg' : 'bg-surface-hover text-text-muted',
            )}
            aria-hidden
          >
            {item.guessed ? '✓' : '–'}
          </span>
          <span
            className={clsx(
              'min-w-0 truncate text-sm font-semibold',
              item.guessed ? 'text-text-primary' : 'text-text-muted line-through',
            )}
          >
            {word.word}
          </span>
        </button>
        {/* Пояснение и переход в главу — самая ценная часть этого экрана,
            поэтому кнопка выглядит кнопкой, а не мелким серым знаком: в
            прошлой версии её просто не замечали. */}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={`Что такое «${word.word}»`}
          className="flex shrink-0 items-center px-3"
        >
          <span
            className={clsx(
              'flex h-7 w-7 items-center justify-center rounded-full border text-sm font-bold transition',
              open
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-border text-text-secondary',
            )}
          >
            ?
          </span>
        </button>
      </div>

      {open && (
        <div className="border-t border-border px-3 py-3">
          <p className="text-sm text-text-secondary">{word.gloss}</p>
          {word.reference && (
            // Ссылка ведёт в читалку — ради этого перехода игра и стоит в
            // приложении о Библии, а не отдельным развлечением сбоку.
            <Link
              href={`/learn?book=${word.reference.bookId}&chapter=${word.reference.chapter}`}
              className="mt-2 inline-block text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              {word.reference.label} →
            </Link>
          )}
        </div>
      )}
    </li>
  );
}
