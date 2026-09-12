'use client';

import {
  DICE_DEFAULT_TARGET,
  DICE_OPPONENTS,
  DICE_BOT_LEVELS,
  DICE_TARGET_OPTIONS,
  analyzeRoll,
  scoreSelection,
  type DiceMatchView,
  type DiceBotLevel,
  type DiceProgress,
  type DiceValue,
} from '@bible-arena/shared';
import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DICE_ROLL_MS, DiceTable3D, type OpponentAppearance } from '@/components/dice3d';
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

function opponentAppearance(match: DiceMatchView, rivalId?: string): OpponentAppearance {
  if (match.botDifficulty) {
    return match.botDifficulty === 'MEDIUM' ? 'female-innkeeper' : 'male-traveler';
  }
  const stableKey = rivalId ?? match.matchId;
  const parity = [...stableKey].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return parity % 2 === 0 ? 'female-innkeeper' : 'male-traveler';
}

type Screen = 'menu' | 'rules' | 'tutorial' | 'match';

export default function DicePage() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [match, setMatch] = useState<DiceMatchView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<number>(DICE_DEFAULT_TARGET);
  const [code, setCode] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [progress, setProgress] = useState<DiceProgress | null>(null);

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
  const atTable =
    screen === 'tutorial' || (screen === 'match' && match !== null && match.status !== 'WAITING');
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
        // Ответ мог потеряться уже после того, как сервер применил действие.
        // Перечитываем активный стол: версия сервера восстановит экран, а
        // expectedVersion не даст повторному нажатию сыграть дважды.
        void apiClient
          .get<{ match: DiceMatchView | null }>('/dice/active')
          .then((active) => {
            if (active.match) apply(active.match);
          })
          .catch(() => undefined);
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );

  const cancelWaiting = useCallback(async () => {
    if (!match) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/dice/${match.matchId}/cancel`, {});
      setMatch(null);
      setScreen('menu');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось отменить ожидание');
    } finally {
      setBusy(false);
    }
  }, [match]);

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

  useEffect(() => {
    void apiClient
      .get<DiceProgress>('/dice/progress')
      .then(setProgress)
      .catch(() => undefined);
  }, [match?.status]);

  // Пока ход соперника — спрашиваем состояние. Свои действия обновляют
  // экран сразу ответом сервера, поэтому опрос нужен только на чужой ход
  // и на ожидание соперника. Ожидание тоже опрашивается: если стол
  // закрыли уборщиком, экран должен увидеть ABANDONED, а не крутить
  // «Ждём соперника» вечно.
  const matchId = match?.matchId;
  const waitingForOther =
    match !== null &&
    (match.status === 'WAITING' ||
      (match.status === 'IN_PROGRESS' &&
        (match.currentPlayerId !== match.youId || match.actions.length === 0)));

  useEffect(() => {
    if (!matchId || !waitingForOther) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const fresh = await apiClient.get<DiceMatchView>(`/dice/${matchId}`);
        if (!cancelled) {
          setError(null);
          setMatch((current) =>
            current && current.matchId === fresh.matchId && fresh.version >= current.version
              ? fresh
              : current,
          );
        }
      } catch {
        // Краткий обрыв связи не выкидывает из партии: следующий опрос
        // продолжит с того же состояния.
      } finally {
        if (!cancelled) timer = setTimeout(poll, POLL_MS);
      }
    };

    timer = setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [matchId, waitingForOther]);

  if (screen === 'rules') {
    return <DiceRules onBack={() => setScreen('menu')} />;
  }

  if (screen === 'tutorial') {
    return <DiceTutorial onFinish={() => setScreen('menu')} />;
  }

  if (screen === 'menu' || !match) {
    return (
      <DiceMenu
        busy={busy}
        error={error}
        target={target}
        code={code}
        progress={progress}
        onTarget={setTarget}
        onCode={setCode}
        onSolo={(difficulty) =>
          void run(() => apiClient.post('/dice/solo', { targetScore: target, difficulty }))
        }
        onFind={() => void run(() => apiClient.post('/dice/find', { targetScore: target }))}
        onCreate={() => void run(() => apiClient.post('/dice', { targetScore: target }))}
        onJoin={() => void run(() => apiClient.post('/dice/join-by-code', { code: code.trim() }))}
        onRules={() => setScreen('rules')}
        onTutorial={() => setScreen('tutorial')}
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
      onAction={(body) =>
        void run(() =>
          apiClient.post(`/dice/${match.matchId}/action`, {
            ...body,
            expectedVersion: match.version,
          }),
        )
      }
      onRematch={() => void run(() => apiClient.post(`/dice/${match.matchId}/rematch`, {}))}
      onCancel={() => void cancelWaiting()}
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
  progress,
  onTarget,
  onCode,
  onSolo,
  onFind,
  onCreate,
  onJoin,
  onRules,
  onTutorial,
}: {
  busy: boolean;
  error: string | null;
  target: number;
  code: string;
  progress: DiceProgress | null;
  onTarget: (value: number) => void;
  onCode: (value: string) => void;
  onSolo: (difficulty: DiceBotLevel) => void;
  onFind: () => void;
  onCreate: () => void;
  onJoin: () => void;
  onRules: () => void;
  onTutorial: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-8 pt-6">
      <ScreenBack href="/play" />
      <div>
        <p className="text-xs uppercase tracking-wide text-text-muted">Игра</p>
        <h1 className="text-2xl font-bold">Кости</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
          Атмосферная дуэль за столом. Заберите очки вовремя — или рискните всем ради большого хода.
        </p>
        <button type="button" onClick={onRules} className="mt-2 text-sm text-primary">
          Как играть и считать очки
        </button>
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

      <Button variant="secondary" onClick={onTutorial} disabled={busy}>
        Научиться за минуту
      </Button>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-semibold">Играть самостоятельно</h2>
          <p className="text-sm text-text-secondary">
            Программа бросает те же честные кости. Отличается только характер решений.
          </p>
        </div>
        {DICE_BOT_LEVELS.map((difficulty, index) => {
          const opponent = DICE_OPPONENTS[difficulty];
          const previous = DICE_BOT_LEVELS[index - 1];
          const locked = previous ? !progress?.wins[previous] : false;
          return (
            <button
              key={difficulty}
              type="button"
              disabled={busy || locked}
              onClick={() => onSolo(difficulty)}
              className="rounded-2xl border border-border bg-surface p-4 text-left disabled:opacity-45"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="font-semibold">{opponent.name}</span>
                <span className="text-xs text-primary">
                  {locked
                    ? `Откроется после победы над ${DICE_OPPONENTS[previous].name}`
                    : opponent.label}
                </span>
              </span>
              <span className="mt-1 block text-sm text-text-secondary">{opponent.description}</span>
            </button>
          );
        })}
      </section>

      <div className="flex items-center gap-3 py-1">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-text-muted">или с человеком</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button onClick={onFind} disabled={busy}>
        {busy ? 'Ищем…' : 'Найти соперника'}
      </Button>
      <Button variant="secondary" onClick={onCreate} disabled={busy}>
        Создать стол для друга
      </Button>

      <Card className="flex-col gap-2">
        <p className="text-sm font-semibold">Войти по коду</p>
        <div className="flex min-w-0 gap-2">
          <input
            value={code}
            onChange={(event) => onCode(event.target.value.toUpperCase())}
            placeholder="КОД"
            maxLength={6}
            className="h-12 min-w-0 flex-1 rounded-xl bg-surface-hover px-3 text-center text-lg font-bold tracking-widest outline-none"
          />
          <button
            type="button"
            onClick={onJoin}
            disabled={busy || code.trim().length < 4}
            className="h-12 shrink-0 rounded-xl bg-surface-hover px-4 text-sm font-semibold disabled:text-text-muted"
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
  onRematch,
  onCancel,
  onLeave,
}: {
  match: DiceMatchView;
  rollKey: string;
  picked: number[];
  busy: boolean;
  error: string | null;
  onPick: (indexes: number[]) => void;
  onAction: (body: { type: string; indexes?: number[]; actionId?: string }) => void;
  onRematch: () => void;
  onCancel: () => void;
  onLeave: () => void;
}) {
  const me = match.players.find((player) => player.userId === match.youId);
  const rival = match.players.find((player) => player.userId !== match.youId);
  const myTurn = match.currentPlayerId === match.youId;
  const finished = match.status === 'FINISHED';
  const abandoned = match.status === 'ABANDONED';
  // Сдача необратима и отдаёт победу, поэтому спрашивается дважды — но
  // не окном поверх экрана: на телефоне оно перекрывает стол целиком.
  const [confirmResign, setConfirmResign] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const previousAnimatedRoll = useRef(rollKey);
  const [revealingRoll, setRevealingRoll] = useState(false);
  const [rollingPlayerId, setRollingPlayerId] = useState<string | null>(null);
  const rollPlayerId =
    match.events.find((event) => event.type === 'ROLL_RESULT')?.playerId ?? match.currentPlayerId;

  useEffect(() => {
    if (previousAnimatedRoll.current === rollKey) return;
    previousAnimatedRoll.current = rollKey;
    setRollingPlayerId(rollPlayerId);
    setRevealingRoll(true);
    const timer = window.setTimeout(() => setRevealingRoll(false), DICE_ROLL_MS + 350);
    return () => window.clearTimeout(timer);
  }, [rollKey, rollPlayerId]);

  const visualMyTurn = revealingRoll ? rollingPlayerId === match.youId : myTurn;

  // Уже отложенные сервером кости. Их нельзя ни выбрать снова, ни
  // подсветить: за них заплачено, и на столе они лежат отдельной кучкой.
  const locked = match.selected;
  // Подсказка «что тут вообще даёт очки» — тем же кодом, каким считает
  // сервер. Не выбор за игрока: выбирает он, в этом стратегия.
  const availableIndexes = match.dice.flatMap((_, index) =>
    locked.includes(index) ? [] : [index],
  );
  const hint = availableIndexes.length
    ? analyzeRoll(availableIndexes.map((index) => match.dice[index])).bestIndexes.map(
        (index) => availableIndexes[index],
      )
    : [];
  const pickedPoints = picked.length ? scoreSelection(match.dice, picked) : null;
  const lastBust = match.events.find((event) => event.type === 'BUST');
  const lastHotDice = match.events.find((event) => event.type === 'HOT_DICE');

  const toggle = (index: number) => {
    if (locked.includes(index)) return;
    onPick(picked.includes(index) ? picked.filter((value) => value !== index) : [...picked, index]);
  };

  // Идентификатор действия — чтобы повторное нажатие на плохой связи не
  // бросило кости заново (см. `docs/dice.md`).
  const actionId = useRef(0);
  const nextActionId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${match.matchId}:${match.version}:${Date.now()}:${++actionId.current}`;

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
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Отменить ожидание
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
          hint={visualMyTurn && !revealingRoll ? hint : []}
          interactive={visualMyTurn && !revealingRoll && !finished && !abandoned && !busy}
          side={visualMyTurn ? 'you' : 'rival'}
          rivalThinking={!visualMyTurn && !revealingRoll && !finished && !abandoned}
          opponentAppearance={opponentAppearance(match, rival?.userId)}
          onPick={toggle}
        />
      </div>

      {/* Затемнение под надписями: на светлом дереве белый текст без него
          не читается, а сплошная плашка закрыла бы стол. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[calc(var(--safe-top)+7rem)] bg-gradient-to-b from-black/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 px-3 pb-[max(0.75rem,var(--safe-bottom))]">
        {finished || abandoned ? (
          <FinishedCard
            match={match}
            abandoned={abandoned}
            onLeave={onLeave}
            onRematch={onRematch}
            busy={busy}
          />
        ) : (
          <>
            {/* Счёт живёт рядом с решениями игрока, а не поверх лица
                соперника. Нижняя safe-area уже учтена контейнером. */}
            <div className="flex items-start gap-2" data-testid="dice-score-hud">
              <ScoreChip player={me} label="Вы" active={visualMyTurn} target={match.targetScore} />
              <div className="shrink-0 rounded-full bg-black/55 px-2.5 py-1 text-center backdrop-blur-sm">
                <p className="text-[9px] uppercase leading-none tracking-wide text-white/50">до</p>
                <p className="text-xs font-bold leading-tight text-primary">{match.targetScore}</p>
              </div>
              <ScoreChip
                player={rival}
                label={null}
                active={!visualMyTurn}
                target={match.targetScore}
                align="right"
              />
            </div>

            {/* Очки хода — крупно: это то самое число, которым рискуют. */}
            <div className="flex items-baseline justify-between px-1">
              <p className="flex items-center gap-2 text-sm font-medium text-white/80">
                {revealingRoll
                  ? visualMyTurn
                    ? 'Ваш бросок…'
                    : 'Бросок соперника…'
                  : myTurn
                    ? 'Ваш ход'
                    : 'Ходит соперник'}
                {!revealingRoll && <TurnCountdown key={match.serverNow} match={match} />}
              </p>
              <p className="text-lg font-bold tabular-nums text-primary">
                +{match.turnScore}
                {pickedPoints ? (
                  <span className="ml-1 text-sm text-success">+{pickedPoints}</span>
                ) : null}
              </p>
            </div>

            {/* Именно эта сумма сгорит при пустом броске — без подписи
                «Забрать N» выглядит как число само по себе, а не как риск. */}
            {!revealingRoll && match.turnScore > 0 && (
              <p className="px-1 text-[11px] text-white/45">
                {match.turnScore} сгорит, если следующий бросок окажется пустым
              </p>
            )}

            {/* В фазе выбора кнопок нет вовсе, и без этой строки экран
                молчит: игрок видит кости и не понимает, чего от него
                ждут. _Нашлось живой проверкой._ */}
            {!revealingRoll && myTurn && match.phase === 'SELECTING' && picked.length === 0 && (
              <p className="text-center text-sm text-white/70">
                Возьмите кости, которые дают очки — они светятся тёплым
              </p>
            )}

            {!revealingRoll &&
              myTurn &&
              (match.phase === 'SELECTING' || match.phase === 'DECISION') && (
                <div className="flex justify-center gap-2" aria-label="Выбор костей списком">
                  {match.dice.map((die, index) => {
                    const unavailable = locked.includes(index);
                    const selected = picked.includes(index);
                    return (
                      <button
                        key={index}
                        type="button"
                        disabled={busy || unavailable}
                        aria-pressed={selected}
                        aria-label={`Кость ${index + 1}: ${die}${unavailable ? ', уже отложена' : ''}`}
                        onClick={() => toggle(index)}
                        className={clsx(
                          'h-10 w-10 rounded-xl border text-sm font-bold backdrop-blur-sm',
                          unavailable && 'border-white/10 bg-black/40 text-white/30',
                          !unavailable && !selected && 'border-white/30 bg-black/55 text-white',
                          selected && 'border-primary bg-primary text-on-primary',
                        )}
                      >
                        {die}
                      </button>
                    );
                  })}
                </div>
              )}

            {!revealingRoll && lastBust && (
              <p
                role="status"
                className="rounded-xl border border-danger/30 bg-black/75 px-3 py-2 text-center text-sm font-semibold text-danger backdrop-blur-sm"
              >
                {lastBust.playerId === match.youId
                  ? `Неудачный бросок — сгорело ${lastBust.lostScore} очков`
                  : `${rival?.nickname ?? 'Соперник'} теряет ${lastBust.lostScore} очков хода`}
              </p>
            )}
            {!revealingRoll && lastHotDice && (
              <p
                role="status"
                className="rounded-xl border border-primary/35 bg-black/75 px-3 py-2 text-center text-sm font-semibold text-primary backdrop-blur-sm"
              >
                {lastHotDice.playerId === match.youId
                  ? 'Hot Dice! Все шесть принесли очки — бросайте их снова'
                  : `Hot Dice у ${rival?.nickname ?? 'соперника'} — снова в игре все шесть`}
              </p>
            )}

            {error && <p className="text-center text-sm text-danger">{error}</p>}

            {!revealingRoll && picked.length > 0 && (
              <Button
                onClick={() =>
                  onAction({ type: 'SELECT', indexes: picked, actionId: nextActionId() })
                }
                disabled={busy || pickedPoints === null}
              >
                {pickedPoints === null ? 'Эти кости очков не дают' : `Отложить · +${pickedPoints}`}
              </Button>
            )}

            {!revealingRoll && match.actions.includes('ROLL') && picked.length === 0 && (
              <Button
                onClick={() => onAction({ type: 'ROLL', actionId: nextActionId() })}
                disabled={busy}
              >
                {match.phase === 'HOT_DICE'
                  ? 'Бросить все шесть'
                  : `Бросить ${match.availableDice}`}
              </Button>
            )}

            {!revealingRoll && match.actions.includes('CONTINUE') && picked.length === 0 && (
              <Button
                onClick={() => onAction({ type: 'CONTINUE', actionId: nextActionId() })}
                disabled={busy}
              >
                Рискнуть и бросить {match.availableDice}
              </Button>
            )}

            {!revealingRoll && match.actions.includes('BANK') && picked.length === 0 && (
              <Button
                variant="secondary"
                onClick={() => onAction({ type: 'BANK', actionId: nextActionId() })}
                disabled={busy}
              >
                Забрать {match.turnScore}
              </Button>
            )}

            {!revealingRoll && !myTurn && (
              <p className="py-1 text-center text-sm text-white/50">
                {rival?.isBot ? `${rival.nickname} делает ход…` : 'Соперник думает…'}
              </p>
            )}

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
                onClick={() => setShowRules(true)}
                className="text-xs text-white/45 underline-offset-4 hover:text-white/70 hover:underline"
              >
                Правила
              </button>
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

      {showRules && <DiceRulesOverlay onClose={() => setShowRules(false)} />}
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

function FinishedCard({
  match,
  abandoned,
  onLeave,
  onRematch,
  busy,
}: {
  match: DiceMatchView;
  abandoned: boolean;
  onLeave: () => void;
  onRematch: () => void;
  busy: boolean;
}) {
  const won = match.winnerId === match.youId;
  const me = match.players.find((player) => player.userId === match.youId);
  const rival = match.players.find((player) => player.userId !== match.youId);
  const rivalName = rival?.nickname ?? 'Соперник';

  // Каждый исход говорит своим текстом, а не общим «Партия окончена»:
  // сдаться, досидеть таймаут и честно выиграть по очкам — три разные
  // вещи, и игрок должен понимать, что именно произошло.
  let title: string;
  let subtitle: string;
  if (abandoned) {
    title = 'Партия не состоялась';
    subtitle = 'Соперник не сел за стол или партию бросили не доиграв. Наград за неё нет.';
  } else if (match.finishReason === 'RESIGN') {
    if (won) {
      title = 'Победа';
      subtitle = `${rivalName} сдался`;
    } else {
      title = 'Вы сдались';
      subtitle = 'Партия завершена. Если хочется реванша — соперник увидит предложение.';
    }
  } else if (match.finishReason === 'TIMEOUT') {
    if (won) {
      title = 'Победа';
      subtitle = `${rivalName} не успел сделать ход дважды подряд`;
    } else {
      title = 'Время вышло';
      subtitle = 'Вы пропустили два хода подряд — партия завершена';
    }
  } else if (match.finishReason === null) {
    title = won ? 'Победа' : 'Партия окончена';
    subtitle = 'Для этой партии подробности завершения не сохранились';
  } else if (won) {
    title = 'Победа';
    subtitle = `Вы первым набрали ${match.targetScore} очков`;
  } else {
    title = 'Победа соперника';
    subtitle = `${rivalName} первым набрал ${match.targetScore} очков`;
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/70 p-4 backdrop-blur-sm">
      <p
        className={clsx(
          'text-center text-lg font-bold text-white',
          !won && !abandoned && 'text-text-secondary',
        )}
      >
        {title}
      </p>
      <p className="text-center text-xs leading-relaxed text-white/60">{subtitle}</p>
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
      {!abandoned && (
        <p className="text-center text-xs text-white/50">
          Ходов: {match.turnNumber} · Hot Dice: {me?.hotDiceCount ?? 0} · Неудачных бросков:{' '}
          {me?.bustCount ?? 0} · Лучший ход: {me?.bestTurn ?? 0}
        </p>
      )}
      {!abandoned && (
        <Button onClick={onRematch} disabled={busy}>
          {match.botDifficulty ? 'Сыграть ещё раз' : 'Предложить реванш'}
        </Button>
      )}
      <button type="button" onClick={onLeave} className="text-sm text-white/60">
        Вернуться в меню
      </button>
    </div>
  );
}

/** Счётчик времени хода, когда партия играется по таймеру.
 *
 * `serverNow` и `turnDeadlineAt` — серверные часы из одного ответа, их
 * разница даёт оставшееся время в момент ответа. Локальный `now` только
 * тикает от этого момента: точности до секунды для счётчика достаточно, а
 * рассинхрон локальных часов значения не имеет — он вычитается.
 */
function TurnCountdown({ match }: { match: DiceMatchView }) {
  const deadlineMs = match.turnDeadlineAt ? new Date(match.turnDeadlineAt).getTime() : null;
  const serverAtMs = new Date(match.serverNow).getTime();

  // Момент монтирования — точка отсчёта локальных часов. Родитель ставит
  // `key={match.serverNow}`, поэтому пересоздание компонента и есть приход
  // свежего ответа сервера: расхождение часов пересчитывается каждый опрос,
  // а не копится.
  const [mountedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (match.turnTimeLimit === null || deadlineMs === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [deadlineMs, match.turnTimeLimit]);

  if (match.turnTimeLimit === null || deadlineMs === null) return null;
  const elapsedLocal = Math.max(0, now - mountedAt);
  const remaining = deadlineMs - (serverAtMs + elapsedLocal);

  // Округление вверх: при 0.2 секунды игрок должен видеть «1», а не «0»,
  // иначе последняя секунда мигает и исчезает раньше, чем её прочитали.
  const seconds = Math.max(0, Math.ceil(remaining / 1000));
  const urgent = seconds <= 10 && seconds > 0;

  return (
    <span
      className={clsx(
        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
        urgent ? 'bg-danger/25 text-danger' : 'bg-white/10 text-white/70',
      )}
      role="timer"
      aria-label={`До конца хода ${seconds} секунд`}
    >
      {seconds} с
    </span>
  );
}

const TUTORIAL_ROLLS: readonly DiceValue[][] = [
  [1, 5, 2, 3, 4, 6],
  [3, 3, 3, 2, 4, 6],
  [3, 3, 3, 2, 4, 6],
  [2, 3, 4, 6, 2, 3],
  [1, 2, 3, 4, 5, 6],
];

/** Короткая постановочная партия: она работает только на клиенте, не
 * создаёт матч и потому никогда не выдаёт награды или статистику. */
function DiceTutorial({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const dice = TUTORIAL_ROLLS[Math.min(step, TUTORIAL_ROLLS.length - 1)];
  const selecting = step === 0 || step === 1;
  const required = step === 0 ? [0, 1] : [0, 1, 2];
  const ready =
    selecting &&
    picked.length === required.length &&
    required.every((index) => picked.includes(index));

  const advance = () => {
    setPicked([]);
    setStep((current) => current + 1);
  };

  const finish = () => {
    try {
      localStorage.setItem('dice-tutorial-complete', '1');
    } catch {
      // Обучение не зависит от доступности локального хранилища.
    }
    onFinish();
  };

  return (
    <div className="relative mx-auto h-[var(--app-height)] w-full max-w-md overflow-hidden bg-black">
      <div className="absolute inset-0">
        <DiceTable3D
          dice={dice}
          rollKey={`tutorial:${step}`}
          picked={picked}
          locked={[]}
          hint={selecting ? required : []}
          interactive={selecting}
          side="you"
          rivalThinking={false}
          opponentAppearance="female-innkeeper"
          onPick={(index) =>
            setPicked((current) =>
              current.includes(index)
                ? current.filter((value) => value !== index)
                : [...current, index],
            )
          }
        />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[calc(var(--safe-top)+8rem)] bg-gradient-to-b from-black/85 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-80 bg-gradient-to-t from-black/90 via-black/60 to-transparent" />

      <div className="absolute inset-x-0 top-0 px-4 pt-[calc(var(--safe-top)+0.75rem)]">
        <div className="flex items-center justify-between text-xs text-white/65">
          <span>Обучение · без наград</span>
          <button type="button" onClick={finish} className="pointer-events-auto text-white/80">
            Пропустить
          </button>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${((step + 1) / 5) * 100}%` }}
          />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 px-4 pb-[calc(var(--safe-bottom)+1rem)]">
        <div className="rounded-2xl border border-white/10 bg-black/75 p-4 backdrop-blur-md">
          {step === 0 && (
            <TutorialCopy
              title="Единицы и пятёрки"
              text="Одиночная единица даёт 100, пятёрка — 50. Коснитесь обеих светящихся костей."
            />
          )}
          {step === 1 && (
            <TutorialCopy
              title="Три одинаковых"
              text="Три тройки вместе дают 300 очков. Выберите всю комбинацию."
            />
          )}
          {step === 2 && (
            <TutorialCopy
              title="Забрать или рискнуть"
              text="После выбора можно сохранить очки или продолжить. Риск приносит больше, но пустой бросок сжигает весь счёт хода."
            />
          )}
          {step === 3 && (
            <TutorialCopy
              title="Bust — пустой бросок"
              text="Здесь нет ни одной комбинации. Очки хода сгорели, а ход перешёл сопернику. Очки прошлых ходов сохраняются."
              tone="danger"
            />
          )}
          {step >= 4 && (
            <TutorialCopy
              title="Hot Dice!"
              text="Если очки дали все шесть костей, вы снова бросаете шесть и сохраняете набранное за ход. Можно продолжить риск или забрать очки."
              tone="primary"
            />
          )}

          {selecting ? (
            <Button onClick={advance} disabled={!ready} className="mt-4 w-full">
              {ready
                ? `Отложить · +${scoreSelection(dice, picked) ?? 0}`
                : 'Выберите подсвеченные кости'}
            </Button>
          ) : step < 4 ? (
            <Button onClick={advance} className="mt-4 w-full">
              {step === 2 ? 'Рискнуть и бросить' : 'Понятно'}
            </Button>
          ) : (
            <Button onClick={finish} className="mt-4 w-full">
              Сыграть настоящую партию
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function TutorialCopy({
  title,
  text,
  tone,
}: {
  title: string;
  text: string;
  tone?: 'danger' | 'primary';
}) {
  return (
    <div>
      <p
        className={clsx(
          'text-lg font-bold text-white',
          tone === 'danger' && 'text-danger',
          tone === 'primary' && 'text-primary',
        )}
      >
        {title}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-white/70">{text}</p>
    </div>
  );
}

function DiceRulesOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="absolute inset-0 z-30 flex items-end bg-black/70 px-3 pb-[calc(var(--safe-bottom)+0.75rem)] pt-[calc(var(--safe-top)+0.75rem)] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Правила игры в кости"
    >
      <div className="max-h-full w-full overflow-y-auto rounded-2xl border border-white/10 bg-surface p-4 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold">Как считать очки</h2>
          <button type="button" onClick={onClose} className="text-sm text-text-secondary">
            Закрыть
          </button>
        </div>
        <DiceRulesContent />
        <Button onClick={onClose} className="mt-4 w-full">
          Продолжить партию
        </Button>
      </div>
    </div>
  );
}

function DiceRules({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-10 pt-6">
      <button type="button" onClick={onBack} className="self-start text-sm text-text-secondary">
        ← Назад
      </button>
      <div>
        <h1 className="text-2xl font-bold">Как играть</h1>
        <p className="mt-1 text-sm text-text-secondary">
          В каждом броске отложите хотя бы одну комбинацию. Затем сохраните очки или рискните:
          пустой бросок сожжёт всё, что набрано за этот ход.
        </p>
      </div>
      <DiceRulesContent />
      <Button onClick={onBack}>Понятно</Button>
    </div>
  );
}

function DiceRulesContent() {
  return (
    <div className="flex flex-col gap-3">
      <Card className="flex-col gap-3">
        <RuleRow label="Одна единица" score="100" />
        <RuleRow label="Одна пятёрка" score="50" />
        <RuleRow label="Три единицы" score="1000" />
        <RuleRow label="Три двойки / тройки / …" score="200 / 300 / …" />
        <RuleRow label="1–2–3–4–5" score="500" />
        <RuleRow label="2–3–4–5–6" score="750" />
        <RuleRow label="1–2–3–4–5–6" score="1500" />
      </Card>
      <Card className="flex-col gap-2 text-sm text-text-secondary">
        <p>Четвёртая одинаковая кость удваивает цену тройки, пятая удваивает снова.</p>
        <p>
          Если зачтены все шесть, наступает Hot Dice: снова бросаете шесть, сохраняя очки хода и
          риск потерять их.
        </p>
        <p>Три пары очков не дают.</p>
      </Card>
    </div>
  );
}

function RuleRow({ label, score }: { label: string; score: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0">
      <span className="text-sm">{label}</span>
      <span className="shrink-0 font-semibold text-primary">{score}</span>
    </div>
  );
}
