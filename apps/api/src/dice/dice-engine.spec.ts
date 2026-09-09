import {
  DICE_ALREADY_TAKEN,
  DICE_BAD_SELECTION,
  DICE_MATCH_OVER,
  DICE_MUST_SELECT,
  DICE_NOT_YOUR_TURN,
  applyDiceAction,
  availableDiceActions,
  createDiceGame,
  type DiceEvent,
  type DiceGameState,
  type DiceValue,
} from '@bible-arena/shared';

/**
 * Движок «Костей»: ход, риск, Bust, Hot Dice, победа.
 *
 * Набор написан по сценариям из `docs/dice.md` до того, как движок
 * запускался вживую. Проверяется не «код что-то вернул», а те правила, из
 * которых игра состоит: сгорает ли ход при Bust, сохраняется ли счёт,
 * переходит ли ход, нельзя ли сыграть за соперника.
 */
describe('Кости — ход и риск', () => {
  const A = 'игрок-A';
  const B = 'игрок-B';
  const roll = (...values: number[]) => values as DiceValue[];

  function game(targetScore = 4000): DiceGameState {
    return createDiceGame({ matchId: 'м1', players: [A, B], targetScore });
  }

  /** Короткая запись: применить действие и вернуть новое состояние. */
  function act(
    state: DiceGameState,
    playerId: string,
    action: Parameters<typeof applyDiceAction>[2],
    dice?: DiceValue[],
  ): DiceGameState {
    return applyDiceAction(state, playerId, action, dice).state;
  }

  function events(
    state: DiceGameState,
    playerId: string,
    action: Parameters<typeof applyDiceAction>[2],
    dice?: DiceValue[],
  ): DiceEvent[] {
    return applyDiceAction(state, playerId, action, dice).events;
  }

  describe('начало', () => {
    it('партия двоих начинается сразу, ходит первый', () => {
      const state = game();
      expect(state.status).toBe('IN_PROGRESS');
      expect(state.currentPlayerId).toBe(A);
      expect(state.availableDice).toBe(6);
      expect(state.phase).toBe('ROLLING');
    });

    it('цель матча — параметр, а не зашитое число', () => {
      expect(game(2000).targetScore).toBe(2000);
      expect(game(5000).targetScore).toBe(5000);
    });
  });

  describe('бросок и выбор', () => {
    it('бросок кладёт кости на стол и ждёт выбора', () => {
      const state = act(game(), A, { type: 'ROLL' }, roll(1, 2, 3, 4, 6, 6));
      expect(state.dice).toEqual([1, 2, 3, 4, 6, 6]);
      expect(state.phase).toBe('SELECTING');
    });

    it('выбранное прибавляется к очкам хода, но не к счёту', () => {
      let state = act(game(), A, { type: 'ROLL' }, roll(1, 2, 3, 4, 6, 6));
      state = act(state, A, { type: 'SELECT', indexes: [0] });
      expect(state.turnScore).toBe(100);
      expect(state.players[0].score).toBe(0);
      expect(state.phase).toBe('DECISION');
      // Пять костей остались на столе — их и бросать.
      expect(state.availableDice).toBe(5);
    });

    it('кости, которые очков не дают, выбрать нельзя', () => {
      const state = act(game(), A, { type: 'ROLL' }, roll(1, 2, 3, 4, 6, 6));
      expect(() =>
        applyDiceAction(state, A, { type: 'SELECT', indexes: [1] }),
      ).toThrow(DICE_BAD_SELECTION);
    });

    it('к отложенному можно доложить ещё кость того же броска', () => {
      let state = act(game(), A, { type: 'ROLL' }, roll(1, 5, 2, 3, 4, 6));
      state = act(state, A, { type: 'SELECT', indexes: [0] }); // 1 = 100
      state = act(state, A, { type: 'SELECT', indexes: [1] }); // 5 = 50
      expect(state.turnScore).toBe(150);
      expect(state.selected).toEqual([0, 1]);
      // Стол уменьшается на обе кости, а не только на последнюю.
      expect(state.availableDice).toBe(4);
    });

    it('за одну и ту же кость не платят дважды', () => {
      // Дыра в счёте, а не мелочь: `selected` заменялся целиком, а очки
      // прибавлялись, и одна единица, выбранная трижды, давала 300.
      let state = act(game(), A, { type: 'ROLL' }, roll(1, 5, 2, 3, 4, 6));
      state = act(state, A, { type: 'SELECT', indexes: [0] });
      expect(() =>
        applyDiceAction(state, A, { type: 'SELECT', indexes: [0] }),
      ).toThrow(DICE_ALREADY_TAKEN);
      expect(() =>
        applyDiceAction(state, A, { type: 'SELECT', indexes: [0, 1] }),
      ).toThrow(DICE_ALREADY_TAKEN);
      expect(state.turnScore).toBe(100);
    });

    it('Hot Dice складывается и из двух выборов подряд', () => {
      let state = act(game(), A, { type: 'ROLL' }, roll(1, 1, 1, 5, 5, 5));
      state = act(state, A, { type: 'SELECT', indexes: [0, 1, 2] }); // 1000
      const result = applyDiceAction(state, A, {
        type: 'SELECT',
        indexes: [3, 4, 5],
      }); // 500
      expect(result.events.some((event) => event.type === 'HOT_DICE')).toBe(
        true,
      );
      expect(result.state.turnScore).toBe(1500);
      expect(result.state.availableDice).toBe(6);
    });

    it('нельзя забрать, ничего не выбрав', () => {
      const state = act(game(), A, { type: 'ROLL' }, roll(1, 2, 3, 4, 6, 6));
      expect(() => applyDiceAction(state, A, { type: 'BANK' })).toThrow(
        DICE_MUST_SELECT,
      );
    });
  });

  describe('комбинация живёт внутри одного броска', () => {
    it('две двойки сейчас и третья потом — не тройка', () => {
      // Ключевое правило из ТЗ. Проверяем самое опасное его нарушение:
      // после переброса выбор считается по новому броску, и старые кости
      // в нём не участвуют вовсе.
      let state = act(game(), A, { type: 'ROLL' }, roll(2, 2, 1, 3, 4, 6));
      state = act(state, A, { type: 'SELECT', indexes: [2] }); // только 1
      state = act(state, A, { type: 'CONTINUE' });
      // В новом броске обязана быть хоть одна scoring-кость, иначе это
      // Bust и ход уже у соперника — проверка вышла бы не про то.
      state = act(state, A, { type: 'ROLL' }, roll(2, 5, 3, 4, 6));

      // Двойка в новом броске одна: две отложенные ей не помогают.
      expect(() =>
        applyDiceAction(state, A, { type: 'SELECT', indexes: [0] }),
      ).toThrow(DICE_BAD_SELECTION);
      // А пятёрка из этого же броска берётся как обычно.
      expect(act(state, A, { type: 'SELECT', indexes: [1] }).turnScore).toBe(
        150,
      );
    });
  });

  describe('Bust', () => {
    it('бросок без комбинаций сжигает очки хода и передаёт ход', () => {
      let state = act(game(), A, { type: 'ROLL' }, roll(1, 1, 1, 2, 3, 4));
      state = act(state, A, { type: 'SELECT', indexes: [0, 1, 2] }); // 1000
      state = act(state, A, { type: 'CONTINUE' });

      const result = applyDiceAction(state, A, { type: 'ROLL' }, roll(2, 3, 4));
      const bust = result.events.find((event) => event.type === 'BUST');

      expect(bust).toEqual({ type: 'BUST', playerId: A, lostScore: 1000 });
      expect(result.state.turnScore).toBe(0);
      // Общий счёт не уменьшается: за прошлые ходы уже заплачено.
      expect(result.state.players[0].score).toBe(0);
      expect(result.state.currentPlayerId).toBe(B);
    });

    it('Bust не отбирает того, что было забрано раньше', () => {
      let state = act(game(), A, { type: 'ROLL' }, roll(1, 1, 2, 3, 4, 6));
      state = act(state, A, { type: 'SELECT', indexes: [0, 1] }); // 200
      state = act(state, A, { type: 'BANK' }); // A: 200, ходит B
      state = act(state, B, { type: 'ROLL' }, roll(5, 2, 3, 4, 6, 6));
      state = act(state, B, { type: 'SELECT', indexes: [0] });
      state = act(state, B, { type: 'BANK' }); // B: 50, снова A

      state = act(state, A, { type: 'ROLL' }, roll(1, 2, 3, 4, 6, 6));
      state = act(state, A, { type: 'SELECT', indexes: [0] }); // +100 к ходу
      state = act(state, A, { type: 'CONTINUE' });
      state = act(state, A, { type: 'ROLL' }, roll(2, 3, 4, 6, 6));

      expect(state.players[0].score).toBe(200);
      expect(state.turnScore).toBe(0);
    });
  });

  describe('Hot Dice', () => {
    it('зачтённые все шесть возвращают шесть костей и сохраняют очки', () => {
      let state = act(game(), A, { type: 'ROLL' }, roll(1, 2, 3, 4, 5, 6));
      const result = applyDiceAction(state, A, {
        type: 'SELECT',
        indexes: [0, 1, 2, 3, 4, 5],
      });
      state = result.state;

      expect(result.events.some((event) => event.type === 'HOT_DICE')).toBe(
        true,
      );
      expect(state.turnScore).toBe(1500);
      expect(state.availableDice).toBe(6);
      expect(state.phase).toBe('HOT_DICE');
    });

    it('после Hot Dice можно и рискнуть, и забрать', () => {
      let state = act(game(), A, { type: 'ROLL' }, roll(1, 2, 3, 4, 5, 6));
      state = act(state, A, { type: 'SELECT', indexes: [0, 1, 2, 3, 4, 5] });
      expect(availableDiceActions(state, A)).toEqual(
        expect.arrayContaining(['ROLL', 'BANK']),
      );
    });

    it('пример хода из задания сходится до последней цифры', () => {
      // 1-2-3-4-5-6 = 1500, Hot Dice, затем 1 = +100, и Bust сжигает 1600.
      let state = act(game(), A, { type: 'ROLL' }, roll(1, 2, 3, 4, 5, 6));
      state = act(state, A, { type: 'SELECT', indexes: [0, 1, 2, 3, 4, 5] });
      state = act(state, A, { type: 'CONTINUE' });
      state = act(state, A, { type: 'ROLL' }, roll(1, 2, 2, 3, 4, 6));
      state = act(state, A, { type: 'SELECT', indexes: [0] });
      expect(state.turnScore).toBe(1600);

      state = act(state, A, { type: 'CONTINUE' });
      const result = applyDiceAction(
        state,
        A,
        { type: 'ROLL' },
        roll(2, 3, 4, 6, 6),
      );
      const bust = result.events.find((event) => event.type === 'BUST');

      expect(bust).toMatchObject({ lostScore: 1600 });
      expect(result.state.players[0].score).toBe(0);
    });
  });

  describe('забрать очки', () => {
    it('очки хода переходят в общий счёт, ход уходит сопернику', () => {
      let state = act(game(), A, { type: 'ROLL' }, roll(1, 1, 1, 5, 2, 3));
      state = act(state, A, { type: 'SELECT', indexes: [0, 1, 2, 3] }); // 1050
      const result = applyDiceAction(state, A, { type: 'BANK' });

      expect(result.state.players[0].score).toBe(1050);
      expect(result.state.turnScore).toBe(0);
      expect(result.state.currentPlayerId).toBe(B);
      expect(result.state.availableDice).toBe(6);
      expect(
        result.events.find((event) => event.type === 'TURN_ENDED'),
      ).toMatchObject({ bankedScore: 1050 });
    });
  });

  describe('победа', () => {
    it('достигший цели побеждает сразу', () => {
      let state = game(1000);
      state = act(state, A, { type: 'ROLL' }, roll(1, 1, 1, 2, 3, 4));
      state = act(state, A, { type: 'SELECT', indexes: [0, 1, 2] }); // 1000
      const result = applyDiceAction(state, A, { type: 'BANK' });

      expect(result.state.status).toBe('FINISHED');
      expect(result.state.winnerId).toBe(A);
      expect(
        result.events.find((event) => event.type === 'GAME_FINISHED'),
      ).toMatchObject({ winnerId: A, reason: 'TARGET' });
    });

    it('в законченной партии ходить нельзя', () => {
      let state = game(1000);
      state = act(state, A, { type: 'ROLL' }, roll(1, 1, 1, 2, 3, 4));
      state = act(state, A, { type: 'SELECT', indexes: [0, 1, 2] });
      state = act(state, A, { type: 'BANK' });

      expect(() =>
        applyDiceAction(state, B, { type: 'ROLL' }, roll(1)),
      ).toThrow(DICE_MATCH_OVER);
    });

    it('сдаться можно и не в свой ход', () => {
      // Чаще всего сдаются именно потому, что ход не приходит: соперник
      // ушёл или думает десять минут. _Живой случай: кнопка на экране
      // была, а сервер отвечал «Сейчас ходит соперник»._
      const state = game(); // ходит A
      const result = applyDiceAction(state, B, { type: 'RESIGN' });

      expect(result.state.status).toBe('FINISHED');
      expect(result.state.winnerId).toBe(A);
    });

    it('посторонний сдаться за игроков не может', () => {
      expect(() =>
        applyDiceAction(game(), 'случайный-прохожий', { type: 'RESIGN' }),
      ).toThrow(DICE_NOT_YOUR_TURN);
    });

    it('сдача отдаёт победу сопернику', () => {
      const result = applyDiceAction(game(), A, { type: 'RESIGN' });
      expect(result.state.winnerId).toBe(B);
      expect(
        result.events.find((event) => event.type === 'GAME_FINISHED'),
      ).toMatchObject({ reason: 'RESIGN' });
    });
  });

  describe('чужой ход', () => {
    it('соперник не может бросить за тебя', () => {
      const state = game();
      expect(() =>
        applyDiceAction(state, B, { type: 'ROLL' }, roll(1)),
      ).toThrow(DICE_NOT_YOUR_TURN);
    });

    it('соперник не может выбрать твои кости', () => {
      const state = act(game(), A, { type: 'ROLL' }, roll(1, 2, 3, 4, 6, 6));
      expect(() =>
        applyDiceAction(state, B, { type: 'SELECT', indexes: [0] }),
      ).toThrow(DICE_NOT_YOUR_TURN);
    });

    it('пока не твой ход, доступных действий нет вовсе', () => {
      expect(availableDiceActions(game(), B)).toEqual([]);
    });
  });

  describe('бросок приходит снаружи', () => {
    it('число костей в броске обязано совпадать с состоянием', () => {
      // Движок не выдумывает кости: если сервер прислал не столько,
      // сколько на столе, это ошибка сервера, а не ход игрока.
      let state = act(game(), A, { type: 'ROLL' }, roll(1, 2, 3, 4, 6, 6));
      state = act(state, A, { type: 'SELECT', indexes: [0] });
      state = act(state, A, { type: 'CONTINUE' });

      expect(() =>
        applyDiceAction(state, A, { type: 'ROLL' }, roll(1, 2, 3, 4, 5, 6)),
      ).toThrow(/не совпал/);
    });

    it('два броска подряд без выбора невозможны', () => {
      const state = act(game(), A, { type: 'ROLL' }, roll(1, 2, 3, 4, 6, 6));
      expect(() =>
        applyDiceAction(state, A, { type: 'ROLL' }, roll(1, 2, 3, 4, 6, 6)),
      ).toThrow();
    });
  });

  describe('события', () => {
    it('бросок сообщает выпавшее и номер броска', () => {
      const list = events(game(), A, { type: 'ROLL' }, roll(1, 2, 3, 4, 6, 6));
      expect(list[0]).toMatchObject({
        type: 'ROLL_RESULT',
        playerId: A,
        rollNumber: 1,
      });
    });

    it('выбор сообщает очки и человеческое название комбинации', () => {
      const state = act(game(), A, { type: 'ROLL' }, roll(2, 2, 2, 1, 3, 4));
      const list = events(state, A, { type: 'SELECT', indexes: [0, 1, 2] });
      expect(list[0]).toMatchObject({ type: 'DICE_SELECTED', points: 200 });
      expect(list[1]).toMatchObject({ type: 'SCORE_UPDATED', turnScore: 200 });
    });
  });
});
