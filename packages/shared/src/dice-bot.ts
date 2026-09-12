import { analyzeRoll } from './dice';
import type { DiceAction, DiceGameState } from './dice-engine';

export const DICE_BOT_ID = 'dice:computer';
export const DICE_BOT_LEVELS = ['EASY', 'MEDIUM'] as const;
export type DiceBotLevel = (typeof DICE_BOT_LEVELS)[number];
export const DICE_OPPONENTS = {
  EASY: {
    name: 'Путник',
    label: 'Осторожный',
    description: 'Рано забирает очки. Хороший первый соперник.',
  },
  MEDIUM: {
    name: 'Хозяйка таверны',
    label: 'Уверенная',
    description: 'Чувствует меру и чаще рискует, когда отстаёт.',
  },
} as const;

/** Программа получает только публичное состояние. Нет RNG, доступа к БД,
 * будущим граням или способа менять сложность после неудач человека.
 * Это ограниченный взгляд на следующий бросок, не обещание идеальной игры. */
export function chooseDiceBotAction(state: DiceGameState, level: DiceBotLevel): DiceAction {
  const me = state.players.find((p) => p.userId === state.currentPlayerId);
  if (state.status !== 'IN_PROGRESS' || !me) throw new Error('Программа вызвана вне партии');
  const rival = state.players.find((p) => p.userId !== me.userId);
  const toWin = state.targetScore - me.score;
  if (state.phase === 'ROLLING') return { type: 'ROLL' };
  if (state.phase === 'SELECTING') {
    const indexes = analyzeRoll(state.dice).bestIndexes;
    if (!indexes.length) throw new Error('У программы нет допустимого выбора');
    return { type: 'SELECT', indexes };
  }
  if (state.phase !== 'DECISION' && state.phase !== 'HOT_DICE')
    throw new Error('Неизвестная фаза программы');
  // Победные очки забирает любой характер: риск сверх цели не имеет смысла.
  if (state.turnScore >= toWin) return { type: 'BANK' };
  const behind = Math.max(0, (rival?.score ?? 0) - me.score);
  const keepGoing =
    level === 'EASY'
      ? state.turnScore < 300 && state.availableDice >= 3
      : state.availableDice === 6 ||
        (state.availableDice >= 3 && state.turnScore < 600 + behind * 0.2);
  return keepGoing ? { type: state.phase === 'HOT_DICE' ? 'ROLL' : 'CONTINUE' } : { type: 'BANK' };
}

export interface DiceProgress {
  completed: number;
  wins: Record<DiceBotLevel, number>;
}
