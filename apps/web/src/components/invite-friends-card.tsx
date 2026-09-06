'use client';

import { shareURL } from '@telegram-apps/sdk-react';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { apiClient } from '@/lib/api';

/** Подпись к ссылке. Собирается на клиенте: `shareURL` уходит в Telegram
 * напрямую, до сервера этот путь не доходит. */
const INVITE_TEXT = 'Играем вместе в Библейскую арену';

/**
 * Приглашение друзей через родной экран Telegram.
 *
 * ## Почему именно так, а не списком контактов
 *
 * Telegram не отдаёт приложениям список контактов — ни номера, ни имена, и
 * не отдаст: иначе любой открытый бот уносил бы записную книжку. Показать
 * «всех, кто есть у вас в телефоне» невозможно в принципе.
 *
 * Зато можно открыть **телеграмный** экран выбора: список видит только
 * человек, приложение — нет. Он выбирает кого угодно, Telegram отправляет
 * ссылку от его имени.
 *
 * ## Что уже пробовали вместо `shareURL`
 *
 * `shareURL` открывает экран «Отправить — выберите чаты», где вперемешку
 * группы, каналы и боты. Пробовали заменить его на подготовленное
 * сообщение (`savePreparedInlineMessage` с `allow_user_chats` на сервере и
 * `shareMessage` на клиенте) — оно оставляет в списке только людей.
 * Работало, но **отказались по решению владельца**: обычный выбор чатов
 * привычнее и покрывает случай «кинуть ссылку в семейный чат», ради
 * которого приглашением тоже пользуются.
 *
 * Так что если снова захочется «показывать контакты» — способ известен и
 * дело не в том, что его не нашли.
 *
 * ## Что происходит по ссылке
 *
 * Ссылка несёт `startapp=ref_<id>`, и сервер на входе связывает пришедшего
 * с пригласившим: новичка сразу в друзья, у остальных — обычной заявкой
 * (см. `FriendsService.linkFromInvite`). Поэтому позвавший видит человека
 * сразу после его первого входа, а не ищет потом по нику.
 */
export function InviteFriendsCard() {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await apiClient.get<{ link: string | null }>('/friends/invite-link');
        if (!cancelled) setLink(data.link);
      } catch {
        // Молча: приглашение — не то, ради чего открывают экран друзей, и
        // сообщение об ошибке здесь только мешало бы списку.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Ссылки нет, пока у сервера нет токена бота. Тогда и кнопки нет: пустая
  // кнопка, которая ничего не делает, хуже её отсутствия.
  if (!link) return null;

  const share = () => {
    if (shareURL.isAvailable()) {
      shareURL(link, INVITE_TEXT);
      return;
    }
    // Вне Telegram (или на старом клиенте) родного выбора нет — остаётся
    // отдать ссылку в руки.
    // Вопросительный знак нужен дважды: буфера может не быть вовсе (тогда
    // `clipboard` — `undefined`), и тогда `.then` звать не на чем.
    void navigator.clipboard?.writeText(link)?.then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Card className="flex-col gap-3">
      <div>
        <p className="text-sm font-semibold">Позвать друзей</p>
        <p className="mt-1 text-xs text-text-secondary">
          Откроется выбор в Telegram. Кого выберете — тот попадёт сразу к вам в друзья.
        </p>
      </div>
      <button
        type="button"
        onClick={share}
        className="h-11 rounded-xl bg-primary text-sm font-semibold text-on-primary transition active:scale-[0.99]"
      >
        {copied ? 'Ссылка скопирована' : 'Выбрать в Telegram'}
      </button>
    </Card>
  );
}
