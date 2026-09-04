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

/**
 * Что случилось последним лично со мной.
 *
 * Одно поле на два события — ответ на моё слово и сгоревшее слово, —
 * потому что показывается всегда только последнее. Два независимых поля
 * пришлось бы гасить друг об друга вручную, и однажды одно из них
 * осталось бы висеть поверх другого.
 *
 * `seq` растёт с каждым событием: по нему React перерисовывает сообщение
 * заново, даже если текст тот же самый.
 */
export type DuelNotice =
  | {
      kind: 'verdict';
      seq: number;
      rank: number | null;
      understood: string | null;
      repeat: boolean;
    }
  | { kind: 'burnt'; seq: number };

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
  const [notice, setNotice] = useState<DuelNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Растёт на каждый ход соперника — по нему экран моргает числом. */
  const [opponentMoves, setOpponentMoves] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Всё ниже описывает подключение к предыдущей дуэли: без сброса чужая
    // ошибка или чужое состояние остались бы висеть на экране новой.
    function resetForNewDuel() {
      setState(null);
      setNotice(null);
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
      // рассылке этих полей нет, и старое сообщение надо убрать, иначе оно
      // висело бы под чужим ходом.
      setNotice((prev) =>
        payload.rank !== undefined
          ? {
              kind: 'verdict',
              seq: (prev?.seq ?? 0) + 1,
              rank: payload.rank ?? null,
              understood: payload.understood ?? null,
              repeat: payload.repeat ?? false,
            }
          : null,
      );
    }
    function handleOpponentMoved() {
      setOpponentMoves((count) => count + 1);
    }
    function handleBurnt() {
      setNotice((prev) => ({ kind: 'burnt', seq: (prev?.seq ?? 0) + 1 }));
    }
    function handleError(payload: { message: string }) {
      setError(payload.message);
    }

    socket.on('connect', handleConnect);
    socket.on(HOT_COLD_DUEL_WS_SERVER_EVENTS.state, handleState);
    socket.on(HOT_COLD_DUEL_WS_SERVER_EVENTS.opponentMoved, handleOpponentMoved);
    socket.on(HOT_COLD_DUEL_WS_SERVER_EVENTS.burnt, handleBurnt);
    socket.on(HOT_COLD_DUEL_WS_SERVER_EVENTS.error, handleError);

    return () => {
      socket.off('connect', handleConnect);
      socket.off(HOT_COLD_DUEL_WS_SERVER_EVENTS.state, handleState);
      socket.off(HOT_COLD_DUEL_WS_SERVER_EVENTS.opponentMoved, handleOpponentMoved);
      socket.off(HOT_COLD_DUEL_WS_SERVER_EVENTS.burnt, handleBurnt);
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

  /** Забрать победу, когда соперник ушёл. Право на это проверяет сервер. */
  const claimWin = useCallback(() => {
    setError(null);
    socketRef.current?.emit(HOT_COLD_DUEL_WS_EVENTS.claim, { duelId });
  }, [duelId]);

  return { state, notice, error, opponentMoves, guess, surrender, claimWin };
}
