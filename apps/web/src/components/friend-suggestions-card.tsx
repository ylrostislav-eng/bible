'use client';

import type { FriendSuggestion } from '@bible-arena/shared';
import { useState } from 'react';
import { apiClient } from '@/lib/api';
import { pluralFriends, pluralGames, pluralize } from '@/lib/plural';
import { Card } from './ui/card';

/**
 * «Возможно, вы знакомы» — список тех, кого можно предложить в друзья, не
 * зная ничего личного о человеке.
 *
 * ## Зачем это здесь
 *
 * До этой карточки экран друзей у нового игрока был тупиком: единственный
 * способ кого-то найти — ввести точный игровой ник, а его надо сперва
 * где-то узнать. Приглашение (`InviteFriendsCard`) закрывает случай «позвать
 * своих», эта карточка — «увидеть тех, кто уже здесь».
 *
 * ## Почему подпись обязательна
 *
 * Строка «играли вместе» / «N общих друзей» — не украшение. Список
 * незнакомых ников без основания выглядит случайной выборкой из базы, и его
 * пролистывают не читая; с основанием это узнавание. Поэтому сервер и
 * возвращает причину вместе с человеком, а не просто список id.
 */
export function FriendSuggestionsCard({
  suggestions,
  onAdded,
}: {
  /** `null` — ещё грузится. Приходит пропсом, а не запрашивается здесь:
   * своим запросом карточка появлялась отдельно от остального и сдвигала
   * уже нарисованную страницу. */
  suggestions: FriendSuggestion[] | null;
  onAdded?: () => void;
}) {
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const add = async (userId: string) => {
    setBusyId(userId);
    try {
      await apiClient.post('/friends/requests', { toUserId: userId });
      setSentTo((ids) => new Set(ids).add(userId));
      onAdded?.();
    } catch {
      // Заявка могла уже существовать или человек — удалиться. Строка просто
      // остаётся с кнопкой: повторное нажатие ничего не сломает.
    } finally {
      setBusyId(null);
    }
  };

  // Пока грузится — ничего: карточка появляется и сдвигает список вниз ровно
  // один раз, а не «спиннер → прыжок → содержимое».
  if (suggestions === null || suggestions.length === 0) return null;

  return (
    <Card className="flex-col gap-3">
      <div>
        <p className="text-sm font-semibold">Возможно, вы знакомы</p>
        <p className="mt-1 text-xs text-text-secondary">
          Те, с кем вы уже играли, и друзья ваших друзей.
        </p>
      </div>

      {suggestions.map((person) => (
        <div key={person.userId} className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={
                person.online
                  ? 'h-2 w-2 shrink-0 rounded-full bg-success'
                  : 'h-2 w-2 shrink-0 rounded-full bg-text-muted'
              }
              aria-label={person.online ? 'В сети' : 'Не в сети'}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{person.nickname}</p>
              <p className="truncate text-xs text-text-muted">{reasonLabel(person)}</p>
            </div>
          </div>
          {sentTo.has(person.userId) ? (
            <span className="shrink-0 text-xs text-text-muted">Заявка отправлена</span>
          ) : (
            <button
              type="button"
              onClick={() => void add(person.userId)}
              disabled={busyId === person.userId}
              className="h-9 shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-on-primary disabled:opacity-50"
            >
              Добавить
            </button>
          )}
        </div>
      ))}
    </Card>
  );
}

/** «Играли вместе · 3 партии» либо «2 общих друга». */
function reasonLabel(person: FriendSuggestion): string {
  if (person.reason === 'played') {
    return person.count === 1
      ? 'Играли вместе'
      : `Играли вместе · ${person.count} ${pluralGames(person.count)}`;
  }
  const adjective = pluralize(person.count, ['общий', 'общих', 'общих']);
  return `${person.count} ${adjective} ${pluralFriends(person.count)}`;
}
