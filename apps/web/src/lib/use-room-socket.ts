'use client';

import type { RoomAnswerInput, RoomState } from '@bible-arena/shared';
import { ROOM_WS_EVENTS, ROOM_WS_NAMESPACE, ROOM_WS_SERVER_EVENTS } from '@bible-arena/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from './api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export type RoomRemovedReason = 'kicked' | 'banned';

/**
 * Owns the live WebSocket connection for one room. REST creates/joins the
 * room and hands back a `sessionId`; everything from that point — lobby
 * updates, ready-up, kick/ban, start, answering, the final reveal — arrives
 * as pushed `RoomState` snapshots instead of polling, since a room can have
 * up to `ROOM_MAX_PARTICIPANTS` players all needing the same live view.
 */
export function useRoomSocket(sessionId: string | null) {
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<RoomRemovedReason | null>(null);
  // True when `room:enter` itself failed (no `RoomState` will ever arrive
  // for this session — e.g. kicked/banned while disconnected, or a stale
  // link) — distinct from `error`, which is an in-room action that failed
  // while the session otherwise stays valid.
  const [unavailable, setUnavailable] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Every field here describes the *previous* `sessionId`'s connection —
    // without clearing them a stale `removed`/`unavailable` from an earlier
    // room would keep the "Вас исключили…" (or worse, a permanently stuck
    // "Загрузка…") screen showing forever, even after moving on to a brand
    // new session (or back to no session at all, via `reset()`).
    function resetForNewSession() {
      setRoomState(null);
      setError(null);
      setRemoved(null);
      setUnavailable(false);
    }
    resetForNewSession();

    if (!sessionId) return undefined;

    const token = getAccessToken();
    if (!token) {
      const reportMissingToken = () => setError('Не удалось подключиться — авторизуйтесь заново');
      reportMissingToken();
      return undefined;
    }

    const socket = io(`${API_URL}${ROOM_WS_NAMESPACE}`, {
      auth: { token },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    function handleConnect() {
      socket.emit(ROOM_WS_EVENTS.enter, { sessionId });
    }
    function handleState(state: RoomState) {
      setRoomState(state);
    }
    function handleError(payload: { message: string }) {
      setError(payload.message);
    }
    function handleKicked() {
      setRemoved('kicked');
    }
    function handleBanned() {
      setRemoved('banned');
    }
    function handleUnavailable() {
      setUnavailable(true);
    }

    socket.on('connect', handleConnect);
    socket.on(ROOM_WS_SERVER_EVENTS.state, handleState);
    // Also carries a "the leader closed the room" notice (see
    // `RoomsGateway.closeRoom`) — shown the same way as any other action
    // failure, since there's nothing further the viewer can do either way.
    socket.on(ROOM_WS_SERVER_EVENTS.error, handleError);
    socket.on(ROOM_WS_SERVER_EVENTS.kicked, handleKicked);
    socket.on(ROOM_WS_SERVER_EVENTS.banned, handleBanned);
    socket.on(ROOM_WS_SERVER_EVENTS.unavailable, handleUnavailable);

    return () => {
      socket.off('connect', handleConnect);
      socket.off(ROOM_WS_SERVER_EVENTS.state, handleState);
      socket.off(ROOM_WS_SERVER_EVENTS.error, handleError);
      socket.off(ROOM_WS_SERVER_EVENTS.kicked, handleKicked);
      socket.off(ROOM_WS_SERVER_EVENTS.banned, handleBanned);
      socket.off(ROOM_WS_SERVER_EVENTS.unavailable, handleUnavailable);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionId]);

  const setReady = useCallback(
    (ready: boolean) => {
      if (sessionId) socketRef.current?.emit(ROOM_WS_EVENTS.ready, { sessionId, ready });
    },
    [sessionId],
  );
  const kick = useCallback(
    (userId: string) => {
      if (sessionId) socketRef.current?.emit(ROOM_WS_EVENTS.kick, { sessionId, userId });
    },
    [sessionId],
  );
  const ban = useCallback(
    (userId: string) => {
      if (sessionId) socketRef.current?.emit(ROOM_WS_EVENTS.ban, { sessionId, userId });
    },
    [sessionId],
  );
  const start = useCallback(() => {
    if (sessionId) socketRef.current?.emit(ROOM_WS_EVENTS.start, { sessionId });
  }, [sessionId]);
  const answer = useCallback(
    (input: RoomAnswerInput) => {
      if (sessionId) socketRef.current?.emit(ROOM_WS_EVENTS.answer, { sessionId, ...input });
    },
    [sessionId],
  );
  const leave = useCallback(() => {
    if (sessionId) socketRef.current?.emit(ROOM_WS_EVENTS.leave, { sessionId });
  }, [sessionId]);

  return { roomState, error, removed, unavailable, setReady, kick, ban, start, answer, leave };
}
