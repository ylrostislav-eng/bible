'use client';

import { shareURL } from '@telegram-apps/sdk-react';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { apiClient } from '@/lib/api';

/**
 * Приглашение друзей через родной экран Telegram.
 *
 * ## Почему именно так, а не списком контактов
 *
 * Telegram не отдаёт приложениям список контактов — ни номера, ни имена, и
 * не отдаст: иначе любой открытый бот уносил бы записную книжку. Показать
 * «всех, кто есть у вас в телефоне» невозможно в принципе.
 *
 * Зато можно открыть **телеграмный** экран выбора: тот самый, с поиском,
 * аватарками и недавними чатами. Список видит только человек, приложение —
 * нет. Он выбирает кого угодно, Telegram отправляет ссылку от его имени.
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
      shareURL(link, 'Играем вместе в Библейскую арену');
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
          Откроется список контактов Telegram. Кого выберете — тот попадёт сразу к вам в друзья.
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
