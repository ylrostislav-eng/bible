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
import { DiceTable } from '@/components/dice/dice-table';
import { Die } from '@/components/dice/die';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { OilLampFlame } from '@/components/ui/oil-lamp-flame';
import { PlayerLabel } from '@/components/ui/player-label';
import { ScreenBack } from '@/components/ui/screen-back';
import { Spinner } from '@/components/ui/spinner';
import { ApiError, apiClient } from '@/lib/api';

/**
 * «Кости» — партия один на один. Правила и замысел: `docs/dice.md`.
 *
 * Экран ничего не решает сам: и цену комбинации, и список доступных
 * действий считает сервер, а здесь тем же кодом из `shared` только
 * подсвечиваются варианты **до** нажатия. Иначе кнопка гасла бы по своим
 * правилам и рано или поздно разошлась с сервером — молча.
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

  /** Ключ броска: по нему стол понимает, что кости новые. */
  const rollKey = match ? `${match.matchId}:${match.turnNumber}:${match.rollNumber}` : 'none';

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

  // Подсказка «что тут вообще даёт очки» — тем же кодом, каким считает
  // сервер. Не выбор за игрока: выбирает он, в этом стратегия.
  const hint = match.dice.length ? analyzeRoll(match.dice).bestIndexes : [];
  const pickedPoints = picked.length ? scoreSelection(match.dice, picked) : null;

  const toggle = (index: number) => {
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
    <div className="mx-auto flex min-h-[var(--app-height)] max-w-md flex-col gap-3 px-4 pb-6 pt-4">
      {/* Счёт обоих и цель — первое, что нужно, чтобы решить, рисковать
          ли: 700 очков хода значат разное при 3800 и при 200. */}
      <div className="flex items-stretch gap-2">
        <ScoreCard player={me} label="Вы" active={myTurn} target={match.targetScore} />
        <div className="flex flex-col items-center justify-center px-1">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">до</p>
          <p className="text-sm font-bold text-primary">{match.targetScore}</p>
        </div>
        <ScoreCard
          player={rival}
          label={null}
          active={!myTurn && !finished}
          target={match.targetScore}
        />
      </div>

      <DiceTable
        dice={match.dice}
        selected={picked}
        scoringHint={myTurn ? hint : []}
        onToggle={myTurn && !finished ? toggle : undefined}
        disabled={busy || !myTurn}
        rollKey={rollKey}
      />

      {/* Очки хода — крупно: это то самое число, которым рискуют. */}
      <div className="flex items-baseline justify-between px-1">
        <p className="text-sm text-text-secondary">
          {finished
            ? match.winnerId === match.youId
              ? 'Победа'
              : 'Партия окончена'
            : myTurn
              ? 'Ваш ход'
              : 'Ходит соперник'}
        </p>
        <p className="text-lg font-bold text-primary">
          +{match.turnScore}
          {pickedPoints ? <span className="ml-1 text-sm text-success">+{pickedPoints}</span> : null}
        </p>
      </div>

      {/* В фазе выбора кнопок нет вовсе, и без этой строки экран молчит:
          игрок видит кости и не понимает, чего от него ждут. _Нашлось
          живой проверкой._ */}
      {myTurn && !finished && match.phase === 'SELECTING' && picked.length === 0 && (
        <p className="text-center text-sm text-text-secondary">
          Выберите кости, которые дают очки — подсвечены тёплым
        </p>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* Распорка: действия прижаты к низу, к большому пальцу. */}
      <div className="flex-1" />

      {finished ? (
        <FinishedCard match={match} onLeave={onLeave} />
      ) : (
        <div className="flex flex-col gap-2">
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
              {match.phase === 'HOT_DICE' ? 'Бросить все шесть' : `Бросить ${match.availableDice}`}
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

          {!myTurn && <p className="py-2 text-center text-sm text-text-muted">Соперник думает…</p>}

          {/* Два разных выхода, и путать их нельзя. «Свернуть» — уйти с
              экрана, партия ждёт и открывается снова при возвращении.
              «Сдаться» — закончить её по-настоящему, отдав победу.
              Без второй кнопки партия висела бы вечно, а игрок не мог бы
              начать новую: сервер отдаёт ему ту же самую. _Нашлось живой
              проверкой: аккаунт с недоигранной партией не мог попасть в
              меню вовсе._ */}
          <button
            type="button"
            onClick={onLeave}
            className="self-center text-xs text-text-muted underline-offset-4 hover:text-text-secondary hover:underline"
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
              'self-center text-xs underline-offset-4 hover:underline',
              confirmResign ? 'text-danger' : 'text-text-muted hover:text-text-secondary',
            )}
          >
            {confirmResign ? 'Точно сдаться? Нажмите ещё раз' : 'Сдаться'}
          </button>
        </div>
      )}
    </div>
  );
}

function ScoreCard({
  player,
  label,
  active,
  target,
}: {
  player: DiceMatchView['players'][number] | undefined;
  label: string | null;
  active: boolean;
  target: number;
}) {
  const score = player?.score ?? 0;
  return (
    <div
      className={clsx(
        'flex flex-1 flex-col gap-1 rounded-2xl border p-3 transition-colors',
        active ? 'border-primary/60 bg-primary/10' : 'border-white/5 bg-surface',
      )}
    >
      <div className="flex items-center gap-1.5">
        <OilLampFlame size={16} glow={false} look={player?.lamp} />
        <p className="truncate text-xs font-medium">
          {label ?? <PlayerLabel nickname={player?.nickname} role={player?.role} />}
        </p>
      </div>
      <p className="text-xl font-bold">{score}</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/30">
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
    <Card className="flex-col gap-3">
      <p className="text-center text-lg font-bold">{won ? '🏆 Победа' : 'Партия окончена'}</p>
      <div className="flex justify-center gap-6 text-center">
        <div>
          <p className="text-xs text-text-secondary">Вы</p>
          <p className="text-xl font-bold text-primary">{me?.score ?? 0}</p>
        </div>
        <div>
          <p className="text-xs text-text-secondary">Соперник</p>
          <p className="text-xl font-bold">{rival?.score ?? 0}</p>
        </div>
      </div>
      <p className="text-center text-xs text-text-muted">
        Ходов: {match.turnNumber} · Hot Dice: {me?.hotDiceCount ?? 0} · Неудачных бросков:{' '}
        {me?.bustCount ?? 0} · Лучший ход: {me?.bestTurn ?? 0}
      </p>
      <Button onClick={onLeave}>Ещё партия</Button>
    </Card>
  );
}

/** Кость в списке отложенных — та же, но меньше и без нажатия. */
export function HeldDie({ value }: { value: DiceMatchView['dice'][number] }) {
  return <Die value={value} size={34} held />;
}
