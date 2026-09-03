'use client';

import {
  ALIAS_DECK_DEFAULT_COUNT,
  ALIAS_DEFAULT_SETTINGS,
  ALIAS_TEAM_NAMES,
  type AliasAvailabilityResponse,
  type AliasDeckResponse,
  type AliasSettings,
} from '@bible-arena/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useReducer, useMemo, useRef, useState } from 'react';
import { AliasReviewScreen } from '@/components/alias/review-screen';
import { AliasRoundScreen } from '@/components/alias/round-screen';
import {
  AliasBetweenRoundsScreen,
  AliasFinishedScreen,
  AliasHandoffScreen,
} from '@/components/alias/scoreboard';
import { AliasSetupScreen } from '@/components/alias/setup-screen';
import { aliasFeedback, requestWakeLock } from '@/lib/alias/feedback';
import {
  createMatchState,
  matchReducer,
  roundScore,
  type AliasMatchState,
} from '@/lib/alias/match-state';
import { useActiveGame } from '@/lib/active-game-context';
import { ApiError, apiClient } from '@/lib/api';
import { useImmersiveWhile } from '@/lib/immersive-context';
import { useDebounced } from '@/lib/use-debounced';

/** Собирает query-строку фильтров: она одна и та же для подсчёта колоды и
 * для её выдачи, и расходиться этим двум запросам нельзя — иначе игрок
 * увидит одно число, а получит другую колоду. */
function filterQuery(settings: AliasSettings): string {
  const params = new URLSearchParams();
  if (settings.difficulty) params.set('difficulty', settings.difficulty);
  if (settings.categories.length > 0) params.set('categories', settings.categories.join(','));
  if (settings.testaments.length > 0) params.set('testaments', settings.testaments.join(','));
  return params.toString();
}

export default function AliasPage() {
  const router = useRouter();

  const [settings, setSettings] = useState<AliasSettings>(ALIAS_DEFAULT_SETTINGS);
  const [teamNames, setTeamNames] = useState<string[]>([ALIAS_TEAM_NAMES[0], ALIAS_TEAM_NAMES[1]]);
  // Ответ храним вместе с запросом, которому он отвечает: пока они
  // расходятся, экран показывает «считаем», а не устаревшее число. Так
  // ещё и не нужно сбрасывать состояние прямо в теле эффекта.
  const [availability, setAvailability] = useState<{ query: string; value: number } | null>(null);
  const [starting, setStarting] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // `null` значит «партии нет, мы на настройке» — отдельного флага рядом с
  // состоянием нет намеренно: два источника правды о том, идёт ли игра,
  // рано или поздно разойдутся.
  const [match, dispatch] = useReducer(matchReducer, null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Фильтры щёлкают быстро; без задержки на каждое нажатие уходит запрос, и
  // на экране оседает ответ от позапрошлого набора галочек.
  const query = useDebounced(filterQuery(settings), 250);

  // Эффекты ниже зависят от «идёт ли партия», а не от самого состояния:
  // оно меняется на каждое слово, и эффект, завязанный на него, отпускал бы
  // и заново запрашивал блокировку экрана после каждого ответа.
  const inSetup = match === null;

  useEffect(() => {
    if (!inSetup) return undefined;
    let cancelled = false;
    apiClient
      .get<AliasAvailabilityResponse>(`/alias/count${query ? `?${query}` : ''}`)
      .then((response) => {
        if (!cancelled) setAvailability({ query, value: response.available });
      })
      .catch(() => {
        if (!cancelled) setAvailability({ query, value: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [query, inSetup]);

  const available = availability && availability.query === query ? availability.value : null;

  // Alias — отдельный режим, а не страница внутри приложения: нижняя
  // навигация физически перекрывала и «Начать игру» на настройке, и
  // «Угадали» в раунде, а всплывающее «вас вызвали на дуэль» ложилось
  // поверх слова. Поэтому хром убирается на всё время, а выход с экрана
  // настройки даёт собственная стрелка «назад».
  useImmersiveWhile(true);

  // Отмечаем партию активной: вкладка «Играть» возвращает в неё, а входящие
  // вызовы не всплывают посреди раунда.
  const { setActiveGame } = useActiveGame();
  useEffect(() => {
    setActiveGame(inSetup ? null : { type: 'alias', sessionId: 'local', status: 'IN_PROGRESS' });
    return () => setActiveGame(null);
  }, [inSetup, setActiveGame]);

  // Экран не должен гаснуть, пока идёт партия: телефон, уснувший посреди
  // раунда, — самая обидная поломка в этой игре.
  useEffect(() => {
    if (inSetup) return undefined;
    return requestWakeLock();
  }, [inSetup]);

  const start = useCallback(async () => {
    setStarting(true);
    setSetupError(null);
    aliasFeedback.prime();
    try {
      const params = new URLSearchParams(query);
      params.set('count', String(ALIAS_DECK_DEFAULT_COUNT));
      const deck = await apiClient.get<AliasDeckResponse>(`/alias/deck?${params.toString()}`);
      if (deck.words.length === 0) {
        setSetupError('По этим настройкам не нашлось ни одного слова');
        return;
      }
      const names = teamNames.map((name, index) => name.trim() || `Команда ${index + 1}`);
      dispatch({ type: 'reset', state: createMatchState(settings, names, deck.words) });
      setSaveError(null);
    } catch (error) {
      setSetupError(
        error instanceof ApiError
          ? error.message
          : 'Не удалось загрузить слова. Попробуйте ещё раз',
      );
    } finally {
      setStarting(false);
    }
  }, [query, settings, teamNames]);

  const saveMatch = useCallback(async (state: AliasMatchState) => {
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient.post('/alias/matches', {
        teams: state.teams.map((team) => ({ name: team.name, score: team.score })),
        roundsPlayed: Math.max(1, state.roundsPlayed),
        settings: state.settings,
      });
    } catch {
      // Партия уже сыграна и на экране — потеря записи в историю не повод
      // портить финал. Говорим об этом строкой и не мешаем играть дальше.
      setSaveError('Результат не сохранился в историю');
    } finally {
      setSaving(false);
    }
  }, []);

  // Сохраняем ровно один раз на партию, как только она дошла до финала.
  const savedRef = useRef(false);
  useEffect(() => {
    if (!match || match.phase !== 'FINISHED' || savedRef.current) return;
    savedRef.current = true;
    void saveMatch(match);
  }, [match, saveMatch]);

  const guessedCount = useMemo(
    () => (match ? match.round.filter((item) => item.guessed).length : 0),
    [match],
  );

  const quit = useCallback(() => {
    savedRef.current = false;
    dispatch({ type: 'reset', state: null });
  }, []);

  if (!match) {
    return (
      <AliasSetupScreen
        settings={settings}
        onSettingsChange={setSettings}
        teamNames={teamNames}
        onTeamNamesChange={setTeamNames}
        available={available}
        starting={starting}
        error={setupError}
        onStart={() => void start()}
      />
    );
  }

  switch (match.phase) {
    case 'HANDOFF':
      return (
        <AliasHandoffScreen
          teams={match.teams}
          turnIndex={match.turnIndex}
          targetScore={match.settings.targetScore}
          roundsPlayed={match.roundsPlayed}
          onStart={() => dispatch({ type: 'startRound' })}
          onQuit={quit}
        />
      );

    case 'ROUND':
    case 'LAST_WORD':
      return (
        <AliasRoundScreen
          teamName={match.teams[match.turnIndex].name}
          teamIndex={match.turnIndex}
          word={match.current}
          guessedCount={guessedCount}
          roundSeconds={match.settings.roundSeconds}
          soundEnabled={match.settings.soundEnabled}
          lastWord={match.phase === 'LAST_WORD'}
          onAnswer={(guessed) => dispatch({ type: 'answer', guessed })}
          onTimeUp={() => dispatch({ type: 'timeUp' })}
        />
      );

    case 'REVIEW':
      return (
        <AliasReviewScreen
          teamName={match.teams[match.turnIndex].name}
          teamIndex={match.turnIndex}
          items={match.round}
          gained={roundScore(match)}
          onToggle={(index) => dispatch({ type: 'toggleRoundItem', index })}
          onConfirm={() => dispatch({ type: 'confirmRound' })}
        />
      );

    case 'SCOREBOARD':
      return (
        <AliasBetweenRoundsScreen
          teams={match.teams}
          turnIndex={match.turnIndex}
          targetScore={match.settings.targetScore}
          onContinue={() => dispatch({ type: 'continueFromScoreboard' })}
        />
      );

    case 'FINISHED':
      return (
        <AliasFinishedScreen
          teams={match.teams}
          targetScore={match.settings.targetScore}
          roundsPlayed={match.roundsPlayed}
          saving={saving}
          saveError={saveError}
          onPlayAgain={() => {
            savedRef.current = false;
            void start();
          }}
          onExit={() => router.push('/play')}
        />
      );

    default:
      return null;
  }
}
