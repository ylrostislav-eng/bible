import {
  DICE_BOT_ID,
  DICE_OPPONENTS,
  applyDiceAction,
  chooseDiceBotAction,
  createDiceGame,
  timeoutDiceTurn,
  type DiceBotLevel,
  type DiceGameState,
  type DiceValue,
} from '@bible-arena/shared';

describe('Кости — программные соперники', () => {
  const HUMAN = 'человек';
  const roll = (...values: number[]) => values as DiceValue[];

  function game(): DiceGameState {
    return createDiceGame({
      matchId: 'соло',
      players: [DICE_BOT_ID, HUMAN],
      targetScore: 2000,
    });
  }

  for (const level of Object.keys(DICE_OPPONENTS) as DiceBotLevel[]) {
    it(`${DICE_OPPONENTS[level].name} проходит обычный ход только допустимыми действиями`, () => {
      let state = game();
      for (
        let step = 0;
        step < 30 &&
        state.status === 'IN_PROGRESS' &&
        state.currentPlayerId === DICE_BOT_ID;
        step++
      ) {
        const action = chooseDiceBotAction(state, level);
        const dice =
          action.type === 'ROLL'
            ? roll(
                1,
                ...Array.from({ length: state.availableDice - 1 }, () => 2),
              )
            : undefined;
        state = applyDiceAction(state, DICE_BOT_ID, action, dice).state;
      }

      expect(
        state.currentPlayerId === HUMAN || state.status === 'FINISHED',
      ).toBe(true);
      expect(state.players[0].score).toBeGreaterThan(0);
    });
  }

  it('любой характер сразу сохраняет победные очки', () => {
    for (const level of ['EASY', 'MEDIUM'] as const) {
      const state: DiceGameState = {
        ...game(),
        phase: 'DECISION',
        turnScore: 100,
        players: [
          { userId: DICE_BOT_ID, score: 1950 },
          { userId: HUMAN, score: 1900 },
        ],
      };
      expect(chooseDiceBotAction(state, level)).toEqual({ type: 'BANK' });
    }
  });

  it('сложность меняет решение, но не создаёт и не видит бросок', () => {
    const state: DiceGameState = {
      ...game(),
      phase: 'DECISION',
      turnScore: 350,
      availableDice: 4,
    };
    expect(chooseDiceBotAction(state, 'EASY')).toEqual({ type: 'BANK' });
    expect(chooseDiceBotAction(state, 'MEDIUM')).toEqual({ type: 'CONTINUE' });
  });
});

describe('Кости — пропущенный ход', () => {
  it('первый пропуск сжигает очки хода, второй заканчивает матч', () => {
    const initial: DiceGameState = {
      ...createDiceGame({
        matchId: 'таймер',
        players: ['а', 'б'],
        targetScore: 2000,
      }),
      turnScore: 450,
    };
    const first = timeoutDiceTurn(initial);
    expect(first.state.status).toBe('IN_PROGRESS');
    expect(first.state.currentPlayerId).toBe('б');
    expect(first.events[0]).toEqual({
      type: 'TURN_TIMED_OUT',
      playerId: 'а',
      lostScore: 450,
    });

    const backToA = timeoutDiceTurn(first.state);
    const second = timeoutDiceTurn(backToA.state);
    expect(second.state.status).toBe('FINISHED');
    expect(second.state.winnerId).toBe('б');
    expect(second.state.finishReason).toBe('TIMEOUT');
    expect(second.events.at(-1)).toEqual({
      type: 'GAME_FINISHED',
      winnerId: 'б',
      reason: 'TIMEOUT',
    });
  });
});
