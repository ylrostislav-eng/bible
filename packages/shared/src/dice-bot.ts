import { analyzeRoll, scoreSelection } from './dice';
import type { DiceAction, DiceGameState } from './dice-engine';

export const DICE_BOT_ID = 'dice:computer';
export const DICE_BOT_LEVELS = ['EASY', 'MEDIUM', 'HARD'] as const;
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
  HARD: {
    name: 'Счётчик',
    label: 'Расчётливый',
    description: 'Сравнивает комбинации и вероятность потери. Удача у него такая же, как у вас.',
  },
} as const;

/** Полный перебор равновероятных бросков по НАШИМ правилам, включая
 * стриты и отсутствие награды за три пары. Средний выигрыш включает Bust.
 * Эти числа не зависят от профиля игрока и не подстраиваются по исходу. */
export const DICE_ROLL_ODDS = [
  { outcomes: 1, busts: 0, totalPoints: 0 },
  { outcomes: 6, busts: 4, totalPoints: 150 },
  { outcomes: 36, busts: 16, totalPoints: 1800 },
  { outcomes: 216, busts: 60, totalPoints: 18750 },
  { outcomes: 1296, busts: 204, totalPoints: 186000 },
  { outcomes: 7776, busts: 600, totalPoints: 1881750 },
  { outcomes: 46656, busts: 1440, totalPoints: 18621000 },
] as const;

function riskValue(count: number, atRisk: number): number {
  const odds = DICE_ROLL_ODDS[count];
  return (odds.totalPoints - odds.busts * atRisk) / odds.outcomes;
}

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
    let indexes = analyzeRoll(state.dice).bestIndexes;
    if (level === 'HARD') {
      let bestValue = -Infinity;
      for (let mask = 1; mask < 1 << state.dice.length; mask++) {
        const choice = state.dice.flatMap((_, i) => (mask & (1 << i) ? [i] : []));
        const points = scoreSelection(state.dice, choice);
        if (points === null) continue;
        const total = state.turnScore + points;
        const remaining = state.dice.length - choice.length || 6;
        const value =
          total >= toWin ? 1_000_000 + total : total + Math.max(0, riskValue(remaining, total));
        if (value > bestValue) {
          bestValue = value;
          indexes = choice;
        }
      }
    }
    if (!indexes.length) throw new Error('У программы нет допустимого выбора');
    return { type: 'SELECT', indexes };
  }
  if (state.phase !== 'DECISION' && state.phase !== 'HOT_DICE')
    throw new Error('Неизвестная фаза программы');
  // Победные очки забирает любой характер: риск сверх цели не имеет смысла.
  if (state.turnScore >= toWin) return { type: 'BANK' };
  const behind = Math.max(0, (rival?.score ?? 0) - me.score);
  let keepGoing: boolean;
  if (level === 'EASY') {
    keepGoing = state.turnScore < 300 && state.availableDice >= 3;
  } else if (level === 'MEDIUM') {
    keepGoing =
      state.availableDice === 6 ||
      (state.availableDice >= 3 && state.turnScore < 600 + behind * 0.2);
  } else {
    keepGoing = riskValue(state.availableDice, state.turnScore) + behind * 0.04 > 0;
  }
  return keepGoing ? { type: state.phase === 'HOT_DICE' ? 'ROLL' : 'CONTINUE' } : { type: 'BANK' };
}

export interface DiceProgress {
  completed: number;
  wins: Record<DiceBotLevel, number>;
}
