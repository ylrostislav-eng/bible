'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  SHOP_ITEMS,
  isCosmetic,
  type ShopActionResult,
  type ShopItemDefinition,
  type ShopItemState,
  type ShopView,
} from '@bible-arena/shared';
import clsx from 'clsx';
import { AvatarFrame } from '@/components/ui/avatar-frame';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { ApiError, apiClient } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { pluralCoins } from '@/lib/plural';

/**
 * Лавка — единственное место, где монеты уходят обратно.
 *
 * Отделы разделены не для порядка, а потому что это разные решения:
 * расходник покупают, когда он нужен сегодня, оформление — когда накопили.
 * Смешанный список заставлял бы сравнивать несравнимое.
 *
 * Баланс висит вверху и обновляется от каждой покупки: цена рядом с
 * товаром без остатка в кармане — половина сведений, и человеку пришлось бы
 * держать вычитание в голове.
 */
export default function ShopPage() {
  const { user, refreshUser } = useAuth();
  const [view, setView] = useState<ShopView | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justBought, setJustBought] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await apiClient.get<ShopView>('/shop'));
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    // Через таймер: React Compiler не разрешает менять состояние прямо в
    // теле эффекта (см. чеклист).
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);

  const act = useCallback(
    async (id: string, action: 'buy' | 'equip' | 'unequip') => {
      setBusy(id);
      setError(null);
      try {
        const result = await apiClient.post<ShopActionResult>(
          action === 'buy' ? '/shop/buy' : '/shop/equip',
          action === 'unequip' ? { itemId: null } : { itemId: id },
        );
        setView(result);
        if (action === 'buy') setJustBought(id);
        // Монеты видны и в профиле, и на главной — без обновления там
        // осталась бы прежняя цифра, и человек решил бы, что списали
        // дважды.
        await refreshUser();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Не получилось — попробуйте ещё раз');
      } finally {
        setBusy(null);
      }
    },
    [refreshUser],
  );

  if (failed) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6">
        <Header coins={user?.coins ?? 0} />
        <Card className="flex-col gap-2">
          <p className="text-sm text-text-secondary">
            Не удалось открыть лавку — попробуйте зайти ещё раз.
          </p>
        </Card>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6">
        <Header coins={user?.coins ?? 0} />
        <Card className="flex-row items-center justify-center py-8">
          <Spinner className="h-5 w-5" />
        </Card>
      </div>
    );
  }

  const stateOf = (id: string): ShopItemState =>
    view.items.find((item) => item.id === id) ?? {
      id: id as ShopItemState['id'],
      owned: false,
      equipped: false,
      stock: 0,
    };

  const consumables = SHOP_ITEMS.filter((item) => !isCosmetic(item));
  const frames = SHOP_ITEMS.filter((item) => item.kind === 'FRAME');
  const colors = SHOP_ITEMS.filter((item) => item.kind === 'NAME_COLOR');
  const anythingEquipped = view.items.some((item) => item.equipped);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-4 pt-6">
      <Header coins={view.coins} />

      {error && <p className="text-sm text-danger">{error}</p>}

      <Section
        title="Помощь"
        hint="Тратится и покупается снова"
        items={consumables}
        render={(item) => (
          <ItemRow
            key={item.id}
            item={item}
            state={stateOf(item.id)}
            coins={view.coins}
            busy={busy === item.id}
            justBought={justBought === item.id}
            onBuy={() => void act(item.id, 'buy')}
            onEquip={() => void act(item.id, 'equip')}
          />
        )}
      />

      <Section
        title="Рамка значка"
        hint="Видно всем, кто встретит вас в списках"
        items={frames}
        render={(item) => (
          <ItemRow
            key={item.id}
            item={item}
            state={stateOf(item.id)}
            coins={view.coins}
            busy={busy === item.id}
            justBought={justBought === item.id}
            onBuy={() => void act(item.id, 'buy')}
            onEquip={() => void act(item.id, 'equip')}
            preview={
              <AvatarFrame frame={item.value} size={40}>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-hover text-sm font-bold text-primary">
                  {(user?.nickname ?? '?').slice(0, 1).toUpperCase()}
                </span>
              </AvatarFrame>
            }
          />
        )}
      />

      <Section
        title="Цвет имени"
        hint="Ваше имя в рейтинге и у игроков"
        items={colors}
        render={(item) => (
          <ItemRow
            key={item.id}
            item={item}
            state={stateOf(item.id)}
            coins={view.coins}
            busy={busy === item.id}
            justBought={justBought === item.id}
            onBuy={() => void act(item.id, 'buy')}
            onEquip={() => void act(item.id, 'equip')}
            // Кружок цвета, а не имя: ник длиной с `duel_tester_b` не
            // помещался в колонку превью и наезжал на описание соседа.
            // Как выглядит имя, видно по названию товара — оно покрашено
            // тем же цветом.
            preview={
              <span
                className="h-8 w-8 rounded-full border border-white/20"
                style={{ backgroundColor: item.value }}
                aria-hidden
              />
            }
            nameColor={item.value}
          />
        )}
      />

      {/* Снять — отдельной кнопкой и только когда есть что снимать: иначе
          это мёртвая кнопка внизу каждого захода в лавку. */}
      {anythingEquipped && (
        <Button
          variant="secondary"
          disabled={busy !== null}
          onClick={() => void act('', 'unequip')}
        >
          Вернуть обычный вид
        </Button>
      )}

      <p className="text-center text-xs text-text-muted">
        Монеты зарабатываются в любой игре: за верные ответы, за «Слово дня» и за достижения.
      </p>
    </div>
  );
}

function Header({ coins }: { coins: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-xl font-bold">Лавка</h1>
        <p className="text-xs text-text-secondary">Помощь в игре и оформление профиля</p>
      </div>
      <Link href="/profile" className="shrink-0 text-right">
        <span className="text-lg font-bold text-primary">{coins}</span>
        <span className="ml-1 text-xs text-text-secondary">{pluralCoins(coins)}</span>
      </Link>
    </div>
  );
}

function Section({
  title,
  hint,
  items,
  render,
}: {
  title: string;
  hint: string;
  items: readonly ShopItemDefinition[];
  render: (item: ShopItemDefinition) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-secondary">{title}</h2>
        <p className="text-xs text-text-muted">{hint}</p>
      </div>
      {items.map(render)}
    </div>
  );
}

function ItemRow({
  item,
  state,
  coins,
  busy,
  justBought,
  onBuy,
  onEquip,
  preview,
  nameColor,
}: {
  item: ShopItemDefinition;
  state: ShopItemState;
  coins: number;
  busy: boolean;
  justBought: boolean;
  onBuy: () => void;
  onEquip: () => void;
  preview?: React.ReactNode;
  /** Красит название товара — так у цвета имени видно не только пятно,
   * но и как этот цвет читается на буквах. */
  nameColor?: string;
}) {
  const cosmetic = isCosmetic(item);
  const affordable = coins >= item.price;
  const stockFull = item.maxStock !== undefined && state.stock >= item.maxStock;

  return (
    <Card className="flex-row items-center gap-3">
      {preview && <div className="flex w-12 justify-center">{preview}</div>}

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <h3
            className="truncate text-sm font-semibold"
            style={nameColor ? { color: nameColor } : undefined}
          >
            {item.name}
          </h3>
          {/* Запас — не остаток чего-то кончающегося, а «сколько лежит»:
              пугать числом здесь нечем, покупка всегда доступна. */}
          {!cosmetic && state.stock > 0 && (
            <span className="shrink-0 rounded-full bg-surface-hover px-2 py-0.5 text-xs text-primary">
              в запасе {state.stock}
            </span>
          )}
          {state.equipped && (
            <span className="shrink-0 rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">
              надето
            </span>
          )}
        </div>
        <p className="text-xs text-text-secondary">{item.description}</p>
        {justBought && <p className="text-xs text-success">Куплено</p>}
      </div>

      <div className="flex w-24 shrink-0 flex-col items-end gap-1">
        {cosmetic && state.owned ? (
          state.equipped ? (
            <span className="text-xs text-text-muted">на вас</span>
          ) : (
            <button
              className="h-9 w-full rounded-lg bg-surface-hover text-xs font-semibold text-text-primary transition disabled:text-text-muted"
              disabled={busy}
              onClick={onEquip}
            >
              {busy ? '…' : 'Надеть'}
            </button>
          )
        ) : (
          <>
            <button
              className={clsx(
                'h-9 w-full rounded-lg text-xs font-semibold transition',
                affordable && !stockFull
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-hover text-text-muted',
              )}
              disabled={busy || !affordable || stockFull}
              onClick={onBuy}
            >
              {busy ? '…' : `${item.price}`}
            </button>
            {/* Причина отказа стоит рядом с кнопкой, а не всплывает после
                нажатия: цена должна быть понятна до, а не после. */}
            {stockFull ? (
              <span className="text-center text-[11px] leading-tight text-text-muted">
                запас полон
              </span>
            ) : !affordable ? (
              <span className="text-center text-[11px] leading-tight text-text-muted">
                не хватает {item.price - coins}
              </span>
            ) : (
              <span className="text-[11px] text-text-muted">{pluralCoins(item.price)}</span>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
