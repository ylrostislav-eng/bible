/**
 * Движок «Костей»: правила хода, риска и победы.
 *
 * Чистый модуль. Он ничего не знает ни о React, ни о Telegram, ни о базе,
 * ни о том, откуда взялся бросок: принимает состояние, действие игрока и
 * (для броска) уже готовые кости — возвращает новое состояние и события.
 *
 * Так сделано по трём причинам, и все три важнее удобства:
 *
 * 1. **Кости бросает сервер.** Движку их передают снаружи, поэтому один и
 *    тот же код считает правила и на сервере, и на экране — но выпавшее
 *    решает только сервер, и подменить его в браузере нечем.
 * 2. **Правила проверяются тестами**, а не игрой вживую: сотня партий
 *    руками не покроет и десятой части того, что покрывают полсотни
 *    проверок за секунду.
 * 3. **События вместо перерисовки.** Движок говорит, что случилось
 *    (`BUST`, `HOT_DICE`, `SCORE_UPDATED`), а как это показать — дело
 *    экрана. Анимациями сервер не занимается вовсе.
 */

import {
  DICE_COUNT,
  analyzeRoll,
  describeSelection,
  isHotDice,
  scoreSelection,
  type DiceValue,
} from './dice';

/** Что сейчас происходит в партии. */
export type DicePhase =
  /** Партия создана, второго игрока ещё нет. */
  | 'WAITING'
  /** Ход начат, кости не брошены — ждём «Бросить». */
  | 'ROLLING'
  /** Кости на столе, игрок выбирает, что зачесть. */
  | 'SELECTING'
  /** Выбор сделан: забрать или рискнуть. */
  | 'DECISION'
  /** Все шесть зачтены — можно бросать снова, не теряя накопленного. */
  | 'HOT_DICE'
  /** Бросок без единой комбинации: накопленное за ход сгорело. */
  | 'BUST'
  | 'GAME_OVER';

export type DiceMatchStatus = 'WAITING' | 'IN_PROGRESS' | 'FINISHED' | 'ABANDONED';

export interface DicePlayerState {
  userId: string;
  score: number;
  bustCount?: number;
  hotDiceCount?: number;
  bestTurn?: number;
}

export interface DiceGameState {
  matchId: string;
  players: [DicePlayerState, DicePlayerState] | [DicePlayerState];
  /** Чей ход. Пусто, пока ждём второго игрока. */
  currentPlayerId: string | null;
  targetScore: number;
  /** Накоплено за текущий ход и ещё не забрано — то, что сгорит при Bust. */
  turnScore: number;
  /** Кости последнего броска. Пусто до первого броска в ходе. */
  dice: DiceValue[];
  /** Индексы костей текущего броска, уже зачтённых в этом же выборе. */
  selected: number[];
  /** Сколько костей будет в следующем броске. */
  availableDice: number;
  turnNumber: number;
  rollNumber: number;
  phase: DicePhase;
  status: DiceMatchStatus;
  winnerId: string | null;
  missedTurns?: Record<string, number>;
  /**
   * Почему партия закончилась. Хранится в состоянии, а не читается из
   * последних событий: события — это последняя порция для анимации, и при
   * возвращении в законченную партию причина из них уже потеряна.
   */
  finishReason?: 'TARGET' | 'RESIGN' | 'TIMEOUT';
}

export type DiceAction =
  | { type: 'ROLL' }
  | { type: 'SELECT'; indexes: number[] }
  | { type: 'BANK' }
  | { type: 'CONTINUE' }
  | { type: 'RESIGN' };

export type DiceEvent =
  | { type: 'GAME_STARTED' }
  | { type: 'TURN_STARTED'; playerId: string; turnNumber: number }
  | { type: 'ROLL_RESULT'; playerId: string; dice: DiceValue[]; rollNumber: number }
  | {
      type: 'DICE_SELECTED';
      playerId: string;
      indexes: number[];
      points: number;
      label: string;
    }
  | { type: 'SCORE_UPDATED'; playerId: string; turnScore: number }
  | { type: 'HOT_DICE'; playerId: string }
  | { type: 'BUST'; playerId: string; lostScore: number }
  | { type: 'TURN_ENDED'; playerId: string; bankedScore: number }
  | { type: 'TURN_TIMED_OUT'; playerId: string; lostScore: number }
  | { type: 'GAME_ABANDONED' }
  | { type: 'GAME_FINISHED'; winnerId: string; reason: 'TARGET' | 'RESIGN' | 'TIMEOUT' };

export interface DiceStepResult {
  state: DiceGameState;
  events: DiceEvent[];
}

/** Действие отклонено правилами: причина словами игрока, а не кодом. */
export class DiceRuleError extends Error {}

export const DICE_NOT_YOUR_TURN = 'Сейчас ходит соперник';
export const DICE_WRONG_PHASE = 'Так сейчас нельзя';
export const DICE_MUST_SELECT = 'Сначала выберите кости, которые дают очки';
export const DICE_BAD_SELECTION = 'Эти кости очков не дают';
export const DICE_ALREADY_TAKEN = 'Эта кость уже отложена';
export const DICE_MATCH_OVER = 'Партия уже закончена';

export function createDiceGame(params: {
  matchId: string;
  players: string[];
  targetScore: number;
}): DiceGameState {
  const players = params.players.map((userId) => ({ userId, score: 0 }));
  return {
    matchId: params.matchId,
    players: players as DiceGameState['players'],
    currentPlayerId: players.length === 2 ? players[0].userId : null,
    targetScore: params.targetScore,
    turnScore: 0,
    dice: [],
    selected: [],
    availableDice: DICE_COUNT,
    turnNumber: players.length === 2 ? 1 : 0,
    rollNumber: 0,
    phase: players.length === 2 ? 'ROLLING' : 'WAITING',
    status: players.length === 2 ? 'IN_PROGRESS' : 'WAITING',
    winnerId: null,
  };
}

/** Второй игрок сел за стол — партия начинается. */
export function joinDiceGame(state: DiceGameState, userId: string): DiceStepResult {
  if (state.players.length === 2) {
    throw new DiceRuleError('За столом уже двое');
  }
  const players = [...state.players, { userId, score: 0 }] as DiceGameState['players'];
  const next: DiceGameState = {
    ...state,
    players,
    currentPlayerId: players[0].userId,
    status: 'IN_PROGRESS',
    phase: 'ROLLING',
    turnNumber: 1,
  };
  return {
    state: next,
    events: [
      { type: 'GAME_STARTED' },
      { type: 'TURN_STARTED', playerId: players[0].userId, turnNumber: 1 },
    ],
  };
}

/**
 * Применяет действие игрока.
 *
 * `roll` — уже выпавшие кости; движок их не выдумывает. Для `ROLL` они
 * обязательны, для остальных действий не нужны.
 */
export function applyDiceAction(
  state: DiceGameState,
  playerId: string,
  action: DiceAction,
  roll?: DiceValue[],
): DiceStepResult {
  if (state.status === 'FINISHED' || state.status === 'ABANDONED') {
    throw new DiceRuleError(DICE_MATCH_OVER);
  }
  if (state.status === 'WAITING') throw new DiceRuleError(DICE_WRONG_PHASE);

  // Сдача — единственное действие вне очереди, и это принципиально.
  //
  // Ждать своего хода, чтобы выйти из партии, абсурдно: чаще всего
  // сдаются как раз потому, что ход не приходит — соперник ушёл, думает
  // десять минут или партия просто надоела. _Нашлось живой проверкой:
  // кнопка «Сдаться» на экране была, а сервер отвечал «Сейчас ходит
  // соперник»._
  if (action.type !== 'RESIGN' && playerId !== state.currentPlayerId) {
    throw new DiceRuleError(DICE_NOT_YOUR_TURN);
  }
  if (action.type === 'RESIGN' && !state.players.some((player) => player.userId === playerId)) {
    throw new DiceRuleError(DICE_NOT_YOUR_TURN);
  }

  // Осмысленное действие прерывает серию пропущенных ходов.
  state = { ...state, missedTurns: { ...state.missedTurns, [playerId]: 0 } };
  switch (action.type) {
    case 'ROLL':
      return applyRoll(state, playerId, roll);
    case 'SELECT':
      return applySelect(state, playerId, action.indexes);
    case 'BANK':
      return applyBank(state, playerId);
    case 'CONTINUE':
      return applyContinue(state);
    case 'RESIGN':
      return applyResign(state, playerId);
  }
}

/** Вызывается только сервером по сохранённому сроку, не по часам клиента. */
export function timeoutDiceTurn(state: DiceGameState): DiceStepResult {
  if (state.status !== 'IN_PROGRESS' || !state.currentPlayerId) {
    throw new DiceRuleError(DICE_MATCH_OVER);
  }
  const playerId = state.currentPlayerId;
  const missed = (state.missedTurns?.[playerId] ?? 0) + 1;
  const next = { ...state, missedTurns: { ...state.missedTurns, [playerId]: missed } };
  const event: DiceEvent = { type: 'TURN_TIMED_OUT', playerId, lostScore: state.turnScore };
  if (missed >= 2) {
    const result = applyResign(next, playerId);
    return {
      state: {
        ...result.state,
        finishReason: 'TIMEOUT',
      },
      events: [
        event,
        { type: 'GAME_FINISHED', winnerId: result.state.winnerId!, reason: 'TIMEOUT' },
      ],
    };
  }
  const result = endTurn(next, playerId, 0);
  return { state: result.state, events: [event, ...result.events] };
}

/** Завершает показ пустого броска. До этого момента выпавшие кости
 * остаются в состоянии, чтобы все клиенты успели показать результат. */
export function resolveDiceBust(state: DiceGameState): DiceStepResult {
  if (state.status !== 'IN_PROGRESS' || state.phase !== 'BUST' || !state.currentPlayerId) {
    throw new DiceRuleError(DICE_WRONG_PHASE);
  }
  return endTurn(state, state.currentPlayerId, 0);
}

function applyRoll(
  state: DiceGameState,
  playerId: string,
  roll: DiceValue[] | undefined,
): DiceStepResult {
  if (state.phase !== 'ROLLING' && state.phase !== 'HOT_DICE') {
    throw new DiceRuleError(DICE_WRONG_PHASE);
  }
  if (!roll || roll.length !== state.availableDice) {
    // Не ошибка игрока, а несовпадение сервера с самим собой: сколько
    // костей бросать, знает состояние, и бросок обязан ему соответствовать.
    throw new DiceRuleError('Бросок не совпал с числом костей на столе');
  }

  const events: DiceEvent[] = [
    {
      type: 'ROLL_RESULT',
      playerId,
      dice: [...roll],
      rollNumber: state.rollNumber + 1,
    },
  ];

  const analysis = analyzeRoll(roll);
  if (analysis.bust) {
    // Всё накопленное за ход сгорает. Общий счёт не трогаем — за прошлые
    // ходы уже заплачено.
    events.push({ type: 'BUST', playerId, lostScore: state.turnScore });
    return {
      state: {
        ...state,
        dice: [...roll],
        selected: [],
        turnScore: 0,
        rollNumber: state.rollNumber + 1,
        phase: 'BUST',
      },
      events,
    };
  }

  return {
    state: {
      ...state,
      dice: [...roll],
      selected: [],
      rollNumber: state.rollNumber + 1,
      phase: 'SELECTING',
    },
    events,
  };
}

/**
 * Зачитывает выбранные кости текущего броска.
 *
 * Выбор всегда разбирается **внутри одного броска**: взять две двойки
 * сейчас, третью следующим броском и объявить тройку нельзя. Поэтому
 * `selected` — индексы в текущем `dice`, а не накопленный за ход список.
 */
function applySelect(state: DiceGameState, playerId: string, indexes: number[]): DiceStepResult {
  if (state.phase !== 'SELECTING' && state.phase !== 'DECISION') {
    throw new DiceRuleError(DICE_WRONG_PHASE);
  }

  // Из `DECISION` можно доложить ещё кость того же броска: взял единицу,
  // потом передумал и взял к ней пятёрку. Но **только не отложенную
  // раньше**.
  //
  // Без этой проверки была дыра в счёте, а не мелочь: `selected`
  // заменялся целиком, а очки прибавлялись, и повторный выбор той же
  // кости платил за неё второй раз. Единица, выбранная трижды по
  // одной, давала 300 вместо 100. _Нашлось при разборе того, что должен
  // показывать трёхмерный стол: «отложенные» и «выбранные» — разные
  // кучки, и стало видно, что сервер их не различает._
  const taken = state.phase === 'DECISION' ? state.selected : [];
  if (indexes.some((index) => taken.includes(index))) {
    throw new DiceRuleError(DICE_ALREADY_TAKEN);
  }

  const points = scoreSelection(state.dice, indexes);
  if (points === null) throw new DiceRuleError(DICE_BAD_SELECTION);

  const turnScore = state.turnScore + points;
  const label = describeSelection(state.dice, indexes);
  const events: DiceEvent[] = [
    { type: 'DICE_SELECTED', playerId, indexes: [...indexes], points, label },
    { type: 'SCORE_UPDATED', playerId, turnScore },
  ];

  // Зачли все кости броска — можно бросать заново все шесть, не теряя
  // накопленного. И рискуя им же: следующий Bust сожжёт всё.
  const selected = [...taken, ...indexes];
  const hot = isHotDice(state.dice, selected);
  if (hot) events.push({ type: 'HOT_DICE', playerId });

  return {
    state: {
      ...state,
      selected,
      turnScore,
      availableDice: hot ? DICE_COUNT : state.dice.length - selected.length,
      phase: hot ? 'HOT_DICE' : 'DECISION',
    },
    events,
  };
}

function applyBank(state: DiceGameState, playerId: string): DiceStepResult {
  if (state.phase !== 'DECISION' && state.phase !== 'HOT_DICE') {
    // Забрать можно только то, что уже зачтено: из `SELECTING` игрок ещё
    // ничего не выбрал, и «забрать ноль» — не решение, а промах по кнопке.
    throw new DiceRuleError(DICE_MUST_SELECT);
  }
  return endTurn(state, playerId, state.turnScore);
}

function applyContinue(state: DiceGameState): DiceStepResult {
  if (state.phase !== 'DECISION' && state.phase !== 'HOT_DICE') {
    throw new DiceRuleError(DICE_MUST_SELECT);
  }
  // Отложенные кости уходят со стола; бросок будет из оставшихся (или из
  // всех шести, если это Hot Dice — `availableDice` уже посчитан).
  return {
    state: { ...state, dice: [], selected: [], phase: 'ROLLING' },
    events: [],
  };
}

function applyResign(state: DiceGameState, playerId: string): DiceStepResult {
  const other = state.players.find((player) => player.userId !== playerId);
  const winnerId = other?.userId ?? playerId;
  return {
    state: {
      ...state,
      status: 'FINISHED',
      phase: 'GAME_OVER',
      winnerId,
      turnScore: 0,
      finishReason: 'RESIGN',
    },
    events: [{ type: 'GAME_FINISHED', winnerId, reason: 'RESIGN' }],
  };
}

/** Общий конец хода: и для «забрал», и для Bust. */
function endTurn(state: DiceGameState, playerId: string, banked: number): DiceStepResult {
  const players = state.players.map((player) =>
    player.userId === playerId ? { ...player, score: player.score + banked } : player,
  ) as DiceGameState['players'];

  const me = players.find((player) => player.userId === playerId)!;
  const events: DiceEvent[] = [{ type: 'TURN_ENDED', playerId, bankedScore: banked }];

  // Достиг цели — победа сразу, без «дать сопернику доиграть»: так решено
  // в задании (KCD-style), а вариант с последним ходом соперника оставлен
  // на потом отдельным правилом матча.
  if (me.score >= state.targetScore) {
    events.push({
      type: 'GAME_FINISHED',
      winnerId: playerId,
      reason: 'TARGET',
    });
    return {
      state: {
        ...state,
        players,
        turnScore: 0,
        dice: [],
        selected: [],
        status: 'FINISHED',
        phase: 'GAME_OVER',
        winnerId: playerId,
        finishReason: 'TARGET',
      },
      events,
    };
  }

  const next = players.find((player) => player.userId !== playerId) ?? me;
  events.push({
    type: 'TURN_STARTED',
    playerId: next.userId,
    turnNumber: state.turnNumber + 1,
  });

  return {
    state: {
      ...state,
      players,
      currentPlayerId: next.userId,
      turnScore: 0,
      dice: [],
      selected: [],
      availableDice: DICE_COUNT,
      turnNumber: state.turnNumber + 1,
      rollNumber: 0,
      phase: 'ROLLING',
    },
    events,
  };
}

/**
 * Что игрок может сделать прямо сейчас.
 *
 * Считает движок, а не экран: кнопка, которая гаснет по своим правилам,
 * рано или поздно разойдётся с сервером — и разойдётся молча.
 */
export function availableDiceActions(state: DiceGameState, playerId: string): DiceAction['type'][] {
  if (state.status !== 'IN_PROGRESS' || playerId !== state.currentPlayerId) {
    return [];
  }
  switch (state.phase) {
    case 'ROLLING':
    case 'HOT_DICE':
      return state.phase === 'HOT_DICE' ? ['ROLL', 'BANK', 'RESIGN'] : ['ROLL', 'RESIGN'];
    case 'SELECTING':
      return ['SELECT', 'RESIGN'];
    case 'DECISION':
      return ['SELECT', 'BANK', 'CONTINUE', 'RESIGN'];
    default:
      return [];
  }
}
