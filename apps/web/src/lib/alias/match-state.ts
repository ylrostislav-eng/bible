import { aliasRoundScore, type AliasSettings, type AliasWordView } from '@bible-arena/shared';

/**
 * Ход партии, целиком на устройстве ведущего.
 *
 * Фазы намеренно разделены на «передайте телефон» и «раунд»: телефон в этой
 * игре физически ходит по кругу, и раунд, стартующий сам собой в чужих
 * руках, — это сгоревшие пять секунд и «стоп, а кто объясняет?». Отдельный
 * экран с большой кнопкой стоит одного нажатия и снимает всю путаницу.
 */
export type AliasPhase = 'HANDOFF' | 'ROUND' | 'LAST_WORD' | 'REVIEW' | 'SCOREBOARD' | 'FINISHED';

export interface AliasTeamState {
  name: string;
  score: number;
}

/** Слово раунда вместе с решением по нему. Храним всю карточку, а не id:
 * на разборе нужны и пояснение, и ссылка, а колода к тому моменту уже
 * уехала вперёд. */
export interface AliasRoundItem {
  word: AliasWordView;
  guessed: boolean;
}

export interface AliasMatchState {
  phase: AliasPhase;
  settings: AliasSettings;
  teams: AliasTeamState[];
  /** Чей сейчас ход. */
  turnIndex: number;
  /** Номер раунда с начала партии, для истории. */
  roundsPlayed: number;
  deck: AliasWordView[];
  /** Позиция в колоде. Дойдя до конца, колода перемешивается и идёт по
   * второму кругу — оборвать партию на «слова кончились» было бы хуже. */
  deckIndex: number;
  /** Сколько раз колода пошла на второй круг: экран может об этом сказать. */
  deckLoops: number;
  round: AliasRoundItem[];
  /** Слово на экране прямо сейчас. */
  current: AliasWordView | null;
}

export type AliasAction =
  /** Начать новую партию или бросить текущую (`state: null`). Через ту же
   * редукцию, что и все остальные переходы, чтобы «нет партии» не жило
   * отдельным флагом рядом с состоянием и не расходилось с ним. */
  | { type: 'reset'; state: AliasMatchState | null }
  | { type: 'startRound' }
  | { type: 'answer'; guessed: boolean }
  | { type: 'timeUp' }
  | { type: 'toggleRoundItem'; index: number }
  | { type: 'confirmRound' }
  | { type: 'continueFromScoreboard' };

export function createMatchState(
  settings: AliasSettings,
  teamNames: string[],
  deck: AliasWordView[],
): AliasMatchState {
  return {
    phase: 'HANDOFF',
    settings,
    teams: teamNames.map((name) => ({ name, score: 0 })),
    turnIndex: 0,
    roundsPlayed: 0,
    deck,
    deckIndex: 0,
    deckLoops: 0,
    round: [],
    current: null,
  };
}

/** Очки за раунд с учётом штрафа за пропуск — считаются той же функцией,
 * что и на сервере. */
export function roundScore(state: AliasMatchState): number {
  return aliasRoundScore(
    state.round.map((item) => ({
      wordId: item.word.id,
      word: item.word.word,
      guessed: item.guessed,
    })),
    state.settings.skipPenalty,
  );
}

/** Достал ли кто-то цель. Проверяется только в конце круга. */
function someoneReachedTarget(state: AliasMatchState): boolean {
  return state.teams.some((team) => team.score >= state.settings.targetScore);
}

function drawNext(state: AliasMatchState): {
  word: AliasWordView | null;
  deck: AliasWordView[];
  deckIndex: number;
  deckLoops: number;
} {
  if (state.deck.length === 0) {
    return { word: null, deck: state.deck, deckIndex: 0, deckLoops: state.deckLoops };
  }
  if (state.deckIndex < state.deck.length) {
    return {
      word: state.deck[state.deckIndex],
      deck: state.deck,
      deckIndex: state.deckIndex + 1,
      deckLoops: state.deckLoops,
    };
  }
  // Колода кончилась — перемешиваем и идём заново. Порядок обязательно
  // меняем: те же слова в том же порядке компания узнаёт мгновенно, и
  // второй круг превращается в зубрёжку списка.
  const reshuffled = shuffle(state.deck);
  return {
    word: reshuffled[0],
    deck: reshuffled,
    deckIndex: 1,
    deckLoops: state.deckLoops + 1,
  };
}

export function matchReducer(
  state: AliasMatchState | null,
  action: AliasAction,
): AliasMatchState | null {
  if (action.type === 'reset') return action.state;
  if (!state) return state;

  switch (action.type) {
    case 'startRound': {
      const drawn = drawNext({ ...state, round: [] });
      return {
        ...state,
        phase: 'ROUND',
        round: [],
        current: drawn.word,
        deck: drawn.deck,
        deckIndex: drawn.deckIndex,
        deckLoops: drawn.deckLoops,
      };
    }

    case 'answer': {
      if (!state.current) return state;
      const round = [...state.round, { word: state.current, guessed: action.guessed }];
      // Последнее слово после сигнала: ответ на него и заканчивает раунд.
      if (state.phase === 'LAST_WORD') {
        return { ...state, phase: 'REVIEW', round, current: null };
      }
      const drawn = drawNext(state);
      return {
        ...state,
        round,
        current: drawn.word,
        deck: drawn.deck,
        deckIndex: drawn.deckIndex,
        deckLoops: drawn.deckLoops,
      };
    }

    case 'timeUp': {
      if (state.phase !== 'ROUND') return state;
      // Без «последнего слова» карточка, висевшая на экране в момент
      // сигнала, не засчитывается никак: команда её не отгадала, но и не
      // пропускала — штрафовать не за что.
      if (state.settings.lastWordAfterBell && state.current) {
        return { ...state, phase: 'LAST_WORD' };
      }
      return { ...state, phase: 'REVIEW', current: null };
    }

    case 'toggleRoundItem': {
      const round = state.round.map((item, index) =>
        index === action.index ? { ...item, guessed: !item.guessed } : item,
      );
      return { ...state, round };
    }

    case 'confirmRound': {
      const gained = roundScore(state);
      const teams = state.teams.map((team, index) =>
        index === state.turnIndex ? { ...team, score: team.score + gained } : team,
      );
      return {
        ...state,
        phase: 'SCOREBOARD',
        teams,
        roundsPlayed: state.roundsPlayed + 1,
      };
    }

    case 'continueFromScoreboard': {
      const isLastInLap = state.turnIndex === state.teams.length - 1;
      // Круг всегда доигрывается до конца: иначе команда, ходившая первой,
      // выигрывает за счёт лишнего хода, и это замечают все за столом.
      if (isLastInLap && someoneReachedTarget(state)) {
        return { ...state, phase: 'FINISHED', round: [], current: null };
      }
      return {
        ...state,
        phase: 'HANDOFF',
        turnIndex: (state.turnIndex + 1) % state.teams.length,
        round: [],
        current: null,
      };
    }

    default:
      return state;
  }
}

/** Лидеры на данный момент. Несколько — значит ничья, и объявлять
 * победителем первого по списку нельзя. */
export function leaders(teams: AliasTeamState[]): AliasTeamState[] {
  if (teams.length === 0) return [];
  const best = Math.max(...teams.map((team) => team.score));
  return teams.filter((team) => team.score === best);
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
