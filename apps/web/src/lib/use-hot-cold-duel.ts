'use client';

import {
  HOT_COLD_DUEL_WS_EVENTS,
  HOT_COLD_DUEL_WS_NAMESPACE,
  HOT_COLD_DUEL_WS_SERVER_EVENTS,
  type HotColdDuelState,
} from '@bible-arena/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from './api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Что игра ответила на последнее моё слово. */
export interface DuelVerdict {
  rank: number | null;
  understood: string | null;
  repeat: boolean;
}

/**
 * Живая связь одной дуэли «горячо-холодно».
 *
 * Опросом это делать нельзя, и дело не в нагрузке. Весь режим держится на
 * том, что число соперника меняется у тебя на глазах: пауза в две секунды
 * между «он сходил» и «ты увидел» убирает ровно то ощущение, ради
 * которого дуэль и затевалась.
 */
export function useHotColdDuel(duelId: string | null) {
  const [state, setState] = useState<HotColdDuelState | null>(null);
  const [verdict, setVerdict] = useState<DuelVerdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Растёт на каждый ход соперника — по нему экран моргает числом. */
  const [opponentMoves, setOpponentMoves] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Всё ниже описывает подключение к предыдущей дуэли: без сброса чужая
    // ошибка или чужое состояние остались бы висеть на экране новой.
    function resetForNewDuel() {
      setState(null);
      setVerdict(null);
      setError(null);
      setOpponentMoves(0);
    }
    resetForNewDuel();

    if (!duelId) return undefined;

    const token = getAccessToken();
    if (!token) {
      const reportMissingToken = () => setError('Не удалось подключиться — авторизуйтесь заново');
      reportMissingToken();
      return undefined;
    }

    const socket = io(`${API_URL}${HOT_COLD_DUEL_WS_NAMESPACE}`, {
      auth: { token },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    function handleConnect() {
      socket.emit(HOT_COLD_DUEL_WS_EVENTS.join, { duelId });
    }
    function handleState(payload: {
      state: HotColdDuelState;
      rank?: number | null;
      understood?: string | null;
      repeat?: boolean;
    }) {
      setState(payload.state);
      // Разбор ввода приходит только в ответ на собственный ход; при общей
      // рассылке этих полей нет, и старый вердикт надо убрать, иначе он
      // висел бы под чужим ходом.
      setVerdict(
        payload.rank !== undefined
          ? {
              rank: payload.rank,
              understood: payload.understood ?? null,
              repeat: payload.repeat ?? false,
            }
          : null,
      );
    }
    function handleOpponentMoved() {
      setOpponentMoves((count) => count + 1);
    }
    function handleError(payload: { message: string }) {
      setError(payload.message);
    }

    socket.on('connect', handleConnect);
    socket.on(HOT_COLD_DUEL_WS_SERVER_EVENTS.state, handleState);
    socket.on(HOT_COLD_DUEL_WS_SERVER_EVENTS.opponentMoved, handleOpponentMoved);
    socket.on(HOT_COLD_DUEL_WS_SERVER_EVENTS.error, handleError);

    return () => {
      socket.off('connect', handleConnect);
      socket.off(HOT_COLD_DUEL_WS_SERVER_EVENTS.state, handleState);
      socket.off(HOT_COLD_DUEL_WS_SERVER_EVENTS.opponentMoved, handleOpponentMoved);
      socket.off(HOT_COLD_DUEL_WS_SERVER_EVENTS.error, handleError);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [duelId]);

  const guess = useCallback(
    (word: string) => {
      setError(null);
      socketRef.current?.emit(HOT_COLD_DUEL_WS_EVENTS.guess, {
        duelId,
        guess: word,
      });
    },
    [duelId],
  );

  const surrender = useCallback(() => {
    setError(null);
    socketRef.current?.emit(HOT_COLD_DUEL_WS_EVENTS.surrender, { duelId });
  }, [duelId]);

  return { state, verdict, error, opponentMoves, guess, surrender };
}
