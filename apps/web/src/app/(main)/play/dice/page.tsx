'use client';

import {
  DICE_DEFAULT_TARGET,
  DICE_TARGET_OPTIONS,
  analyzeRoll,
  scoreSelection,
  type DiceMatchView,
} from '@bible-arena/shared';
import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DiceTable3D } from '@/components/dice3d';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { OilLampFlame } from '@/components/ui/oil-lamp-flame';
import { PlayerLabel } from '@/components/ui/player-label';
import { ScreenBack } from '@/components/ui/screen-back';
import { Spinner } from '@/components/ui/spinner';
import { ApiError, apiClient } from '@/lib/api';
import { useImmersiveWhile } from '@/lib/immersive-context';

/**
 * «Кости» — партия один на один. Правила и замысел: `docs/dice.md`.
 *
 * Экран ничего не решает сам: и цену комбинации, и список доступных
 * действий считает сервер, а здесь тем же кодом из `shared` только
 * подсвечиваются варианты **до** нажатия. Иначе кнопка гасла бы по своим
 * правилам и рано или поздно разошлась с сервером — молча.
 *
 * Стол — трёхмерная сцена от первого лица (`components/dice3d`), и
 * надписи лежат поверх неё, а не рядом: главное в кадре — стол и
 * соперник напротив, а не панель управления.
 */

/** Как часто спрашивать состояние, пока ходит соперник. Игра пошаговая:
 * ход длится десятки секунд, и полторы секунды задержки здесь не видны —
 * в отличие от «горячо-холодно», где всё напряжение в чужом числе,
 * меняющемся на глазах. */
const POLL_MS = 1500;

type Screen = 'menu' | 'match';

export default function DicePage() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [match, setMatch] = useState<DiceMatchView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<number>(DICE_DEFAULT_TARGET);
  const [code, setCode] = useState('');
  const [picked, setPicked] = useState<number[]>([]);

  /** Ключ броска: по нему сцена понимает, что кости новые. */
  const rollKey = match ? `${match.matchId}:${match.turnNumber}:${match.rollNumber}` : 'none';

  /**
   * За столом приложение убирает свой хром: нижнее меню, плавающие
   * кнопки, всплывающие уведомления.
   *
   * Не ради красоты. Обёртка приложения добавляет снизу 10rem под эти
   * кнопки, экран становится **выше окна**, страница начинает
   * прокручиваться — и трёхмерный кадр уезжает вверх вместе с ней:
   * доска в одном положении до прокрутки и в другом после. _Нашлось
   * живой проверкой: два снимка одной партии показывали разную
   * камеру._ Заодно всплывающее «вас вызвали на дуэль» перестаёт
   * закрывать соперника — оно приходилось ровно на его голову.
   */
  const atTable = screen === 'match' && match !== null && match.status !== 'WAITING';
  useImmersiveWhile(atTable);

  const apply = useCallback((view: DiceMatchView) => {
    setMatch(view);
    setScreen('match');
    // Выбор живёт только между броском и подтверждением: новый бросок
    // обнуляет его, иначе номера костей указывали бы в прошлый бросок.
    setPicked([]);
  }, []);

  const run = useCallback(
    async (fn: () => Promise<DiceMatchView>) => {
      setBusy(true);
      setError(null);
      try {
        apply(await fn());
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Не получилось — попробуйте ещё раз');
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );

  // Возвращение в незаконченную партию: приложение закрыли, матч остался
  // на сервере — и открывается ровно там, где его бросили.
  useEffect(() => {
    const timer = setTimeout(() => {
      void apiClient
        .get<{ match: DiceMatchView | null }>('/dice/active')
        .then((active) => {
          if (active.match) apply(active.match);
        })
        .catch(() => undefined);
    }, 0);
    return () => clearTimeout(timer);
  }, [apply]);

  // Пока ход соперника — спрашиваем состояние. Свои действия обновляют
  // экран сразу ответом сервера, поэтому опрос нужен только на чужой ход
  // и на ожидание соперника.
  const matchId = match?.matchId;
  const waitingForOther =
    match !== null &&
    match.status !== 'FINISHED' &&
    (match.status === 'WAITING' || match.currentPlayerId !== match.youId);

  useEffect(() => {
    if (!matchId || !waitingForOther) return;
    const timer = setInterval(() => {
      void apiClient
        .get<DiceMatchView>(`/dice/${matchId}`)
        .then((fresh) => {
          setMatch((current) =>
            // Не затираем состояние, если игрок уже успел походить:
            // ответ опроса мог отстать от собственного действия.
            current && current.matchId === fresh.matchId ? fresh : current,
          );
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [matchId, waitingForOther]);

  if (screen === 'menu' || !match) {
    return (
      <DiceMenu
        busy={busy}
        error={error}
        target={target}
        code={code}
        onTarget={setTarget}
        onCode={setCode}
        onFind={() => void run(() => apiClient.post('/dice/find', { targetScore: target }))}
        onCreate={() => void run(() => apiClient.post('/dice', { targetScore: target }))}
        onJoin={() => void run(() => apiClient.post('/dice/join-by-code', { code: code.trim() }))}
      />
    );
  }

  return (
    <DiceMatchScreen
      match={match}
      rollKey={rollKey}
      picked={picked}
      busy={busy}
      error={error}
      onPick={setPicked}
      onAction={(body) => void run(() => apiClient.post(`/dice/${match.matchId}/action`, body))}
      onLeave={() => {
        setMatch(null);
        setScreen('menu');
      }}
    />
  );
}

function DiceMenu({
  busy,
  error,
  target,
  code,
  onTarget,
  onCode,
  onFind,
  onCreate,
  onJoin,
}: {
  busy: boolean;
  error: string | null;
  target: number;
  code: string;
  onTarget: (value: number) => void;
  onCode: (value: string) => void;
  onFind: () => void;
  onCreate: () => void;
  onJoin: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-8 pt-6">
      <ScreenBack href="/play" />
      <div>
        <p className="text-xs uppercase tracking-wide text-text-muted">Игра</p>
        <h1 className="text-2xl font-bold">Кости</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
          Шесть костей на двоих. Бросаете, откладываете то, что даёт очки, и решаете: забрать
          накопленное или рискнуть и бросить ещё. Не выпало ничего — ход сгорает целиком.
        </p>
      </div>

      <Card className="flex-col gap-3">
        <p className="text-sm font-semibold text-text-secondary">Играем до</p>
        <div className="grid grid-cols-4 gap-2">
          {[...DICE_TARGET_OPTIONS]
            .sort((a, b) => a - b)
            .map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onTarget(option)}
                className={clsx(
                  'h-11 rounded-xl text-sm font-semibold transition',
                  option === target
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-hover text-text-secondary',
                )}
              >
                {option}
              </button>
            ))}
        </div>
      </Card>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button onClick={onFind} disabled={busy}>
        {busy ? 'Ищем…' : 'Найти соперника'}
      </Button>
      <Button variant="secondary" onClick={onCreate} disabled={busy}>
        Создать стол для друга
      </Button>

      <Card className="flex-col gap-2">
        <p className="text-sm font-semibold">Войти по коду</p>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(event) => onCode(event.target.value.toUpperCase())}
            placeholder="КОД"
            maxLength={12}
            className="h-12 flex-1 rounded-xl bg-surface-hover px-4 text-center text-lg font-bold tracking-widest outline-none"
          />
          <button
            type="button"
            onClick={onJoin}
            disabled={busy || code.trim().length < 4}
            className="h-12 rounded-xl bg-surface-hover px-5 text-sm font-semibold disabled:text-text-muted"
          >
            Войти
          </button>
        </div>
      </Card>
    </div>
  );
}

function DiceMatchScreen({
  match,
  rollKey,
  picked,
  busy,
  error,
  onPick,
  onAction,
  onLeave,
}: {
  match: DiceMatchView;
  rollKey: string;
  picked: number[];
  busy: boolean;
  error: string | null;
  onPick: (indexes: number[]) => void;
  onAction: (body: { type: string; indexes?: number[]; actionId?: string }) => void;
  onLeave: () => void;
}) {
  const me = match.players.find((player) => player.userId === match.youId);
  const rival = match.players.find((player) => player.userId !== match.youId);
  const myTurn = match.currentPlayerId === match.youId;
  const finished = match.status === 'FINISHED';
  // Сдача необратима и отдаёт победу, поэтому спрашивается дважды — но
  // не окном поверх экрана: на телефоне оно перекрывает стол целиком.
  const [confirmResign, setConfirmResign] = useState(false);

  // Уже отложенные сервером кости. Их нельзя ни выбрать снова, ни
  // подсветить: за них заплачено, и на столе они лежат отдельной кучкой.
  const locked = match.selected;
  // Подсказка «что тут вообще даёт очки» — тем же кодом, каким считает
  // сервер. Не выбор за игрока: выбирает он, в этом стратегия.
  const hint = match.dice.length
    ? analyzeRoll(match.dice).bestIndexes.filter((index) => !locked.includes(index))
    : [];
  const pickedPoints = picked.length ? scoreSelection(match.dice, picked) : null;

  const toggle = (index: number) => {
    if (locked.includes(index)) return;
    onPick(picked.includes(index) ? picked.filter((value) => value !== index) : [...picked, index]);
  };

  // Идентификатор действия — чтобы повторное нажатие на плохой связи не
  // бросило кости заново (см. `docs/dice.md`).
  const actionId = useRef(0);
  const nextActionId = () =>
    `${match.matchId}:${match.turnNumber}:${match.rollNumber}:${++actionId.current}`;

  if (match.status === 'WAITING') {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6">
        <ScreenBack href="/play" />
        <Card className="flex-col items-center gap-3 py-8">
          <Spinner className="h-6 w-6" />
          <p className="text-sm font-semibold">Ждём соперника</p>
          <p className="text-center text-sm text-text-secondary">
            Позовите друга — он войдёт по коду.
          </p>
          <p className="rounded-xl bg-surface-hover px-4 py-2 text-2xl font-bold tracking-widest">
            {match.inviteCode}
          </p>
        </Card>
        <Button variant="secondary" onClick={onLeave}>
          Назад
        </Button>
      </div>
    );
  }

  return (
    <div className="relative mx-auto h-[var(--app-height)] w-full max-w-md overflow-hidden">
      {/* Стол во весь экран. Надписи лежат поверх и намеренно занимают
          мало места: переделка затевалась ради того, чтобы игрок смотрел
          на стол и на соперника, а не на панель. */}
      <div className="absolute inset-0">
        <DiceTable3D
          dice={match.dice}
          rollKey={rollKey}
          picked={picked}
          locked={locked}
          hint={myTurn ? hint : []}
          interactive={myTurn && !finished && !busy}
          side={myTurn ? 'you' : 'rival'}
          rivalThinking={!myTurn && !finished}
          onPick={toggle}
        />
      </div>

      {/* Затемнение под надписями: на светлом дереве белый текст без него
          не читается, а сплошная плашка закрыла бы стол. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />

      {/* Счёт обоих и цель — первое, что нужно, чтобы решить, рисковать
          ли: 700 очков хода значат разное при 3800 и при 200. */}
      <div className="absolute inset-x-0 top-0 flex items-start gap-2 px-3 pt-3">
        <ScoreChip player={me} label="Вы" active={myTurn && !finished} target={match.targetScore} />
        <div className="shrink-0 rounded-full bg-black/45 px-2.5 py-1 text-center">
          <p className="text-[9px] uppercase leading-none tracking-wide text-white/50">до</p>
          <p className="text-xs font-bold leading-tight text-primary">{match.targetScore}</p>
        </div>
        <ScoreChip
          player={rival}
          label={null}
          active={!myTurn && !finished}
          target={match.targetScore}
          align="right"
        />
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 px-3 pb-[max(0.75rem,var(--safe-bottom))]">
        {finished ? (
          <FinishedCard match={match} onLeave={onLeave} />
        ) : (
          <>
            {/* Очки хода — крупно: это то самое число, которым рискуют. */}
            <div className="flex items-baseline justify-between px-1">
              <p className="text-sm font-medium text-white/80">
                {myTurn ? 'Ваш ход' : 'Ходит соперник'}
              </p>
              <p className="text-lg font-bold tabular-nums text-primary">
                +{match.turnScore}
                {pickedPoints ? (
                  <span className="ml-1 text-sm text-success">+{pickedPoints}</span>
                ) : null}
              </p>
            </div>

            {/* В фазе выбора кнопок нет вовсе, и без этой строки экран
                молчит: игрок видит кости и не понимает, чего от него
                ждут. _Нашлось живой проверкой._ */}
            {myTurn && match.phase === 'SELECTING' && picked.length === 0 && (
              <p className="text-center text-sm text-white/70">
                Возьмите кости, которые дают очки — они светятся тёплым
              </p>
            )}

            {error && <p className="text-center text-sm text-danger">{error}</p>}

            {picked.length > 0 && (
              <Button
                onClick={() =>
                  onAction({ type: 'SELECT', indexes: picked, actionId: nextActionId() })
                }
                disabled={busy || pickedPoints === null}
              >
                {pickedPoints === null ? 'Эти кости очков не дают' : `Отложить · +${pickedPoints}`}
              </Button>
            )}

            {match.actions.includes('ROLL') && picked.length === 0 && (
              <Button
                onClick={() => onAction({ type: 'ROLL', actionId: nextActionId() })}
                disabled={busy}
              >
                {match.phase === 'HOT_DICE'
                  ? 'Бросить все шесть'
                  : `Бросить ${match.availableDice}`}
              </Button>
            )}

            {match.actions.includes('CONTINUE') && picked.length === 0 && (
              <Button
                onClick={() => onAction({ type: 'CONTINUE', actionId: nextActionId() })}
                disabled={busy}
              >
                Рискнуть и бросить {match.availableDice}
              </Button>
            )}

            {match.actions.includes('BANK') && picked.length === 0 && (
              <Button
                variant="secondary"
                onClick={() => onAction({ type: 'BANK', actionId: nextActionId() })}
                disabled={busy}
              >
                Забрать {match.turnScore}
              </Button>
            )}

            {!myTurn && <p className="py-1 text-center text-sm text-white/50">Соперник думает…</p>}

            {/* Два разных выхода, и путать их нельзя. «Свернуть» — уйти с
                экрана, партия ждёт и открывается снова при возвращении.
                «Сдаться» — закончить её по-настоящему, отдав победу.
                Без второй кнопки партия висела бы вечно, а игрок не мог
                бы начать новую: сервер отдаёт ему ту же самую. _Нашлось
                живой проверкой: аккаунт с недоигранной партией не мог
                попасть в меню вовсе._ */}
            <div className="flex items-center justify-center gap-5 pt-0.5">
              <button
                type="button"
                onClick={onLeave}
                className="text-xs text-white/45 underline-offset-4 hover:text-white/70 hover:underline"
              >
                Свернуть стол
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmResign) {
                    onAction({ type: 'RESIGN', actionId: nextActionId() });
                  } else {
                    setConfirmResign(true);
                  }
                }}
                className={clsx(
                  'text-xs underline-offset-4 hover:underline',
                  confirmResign ? 'text-danger' : 'text-white/45 hover:text-white/70',
                )}
              >
                {confirmResign ? 'Точно сдаться? Нажмите ещё раз' : 'Сдаться'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Счёт игрока поверх стола: имя, лампа, очки и полоска до цели. */
function ScoreChip({
  player,
  label,
  active,
  target,
  align = 'left',
}: {
  player: DiceMatchView['players'][number] | undefined;
  label: string | null;
  active: boolean;
  target: number;
  align?: 'left' | 'right';
}) {
  const score = player?.score ?? 0;
  return (
    <div
      className={clsx(
        'flex min-w-0 flex-1 flex-col gap-1 rounded-2xl border px-2.5 py-1.5 backdrop-blur-sm transition-colors',
        active ? 'border-primary/70 bg-primary/20' : 'border-white/10 bg-black/45',
      )}
    >
      <div
        className={clsx(
          'flex min-w-0 items-center gap-1.5',
          align === 'right' && 'flex-row-reverse',
        )}
      >
        <OilLampFlame size={15} glow={false} look={player?.lamp} />
        <p
          className={clsx(
            'min-w-0 flex-1 truncate text-[11px] text-white/75',
            align === 'right' && 'text-right',
          )}
        >
          {label ?? <PlayerLabel nickname={player?.nickname} role={player?.role} />}
        </p>
        <p className="shrink-0 text-base font-bold leading-none tabular-nums text-white">{score}</p>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-black/50">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${Math.min(100, (score / target) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function FinishedCard({ match, onLeave }: { match: DiceMatchView; onLeave: () => void }) {
  const won = match.winnerId === match.youId;
  const me = match.players.find((player) => player.userId === match.youId);
  const rival = match.players.find((player) => player.userId !== match.youId);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/70 p-4 backdrop-blur-sm">
      <p className="text-center text-lg font-bold text-white">
        {won ? '🏆 Победа' : 'Партия окончена'}
      </p>
      <div className="flex justify-center gap-6 text-center">
        <div>
          <p className="text-xs text-white/60">Вы</p>
          <p className="text-xl font-bold text-primary">{me?.score ?? 0}</p>
        </div>
        <div>
          <p className="text-xs text-white/60">Соперник</p>
          <p className="text-xl font-bold text-white">{rival?.score ?? 0}</p>
        </div>
      </div>
      <p className="text-center text-xs text-white/50">
        Ходов: {match.turnNumber} · Hot Dice: {me?.hotDiceCount ?? 0} · Неудачных бросков:{' '}
        {me?.bustCount ?? 0} · Лучший ход: {me?.bestTurn ?? 0}
      </p>
      <Button onClick={onLeave}>Ещё партия</Button>
    </div>
  );
}
