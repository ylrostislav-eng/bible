'use client';

import type { ChatConversationView, ChatMessageEvent } from '@bible-arena/shared';
import { CHAT_WS_EVENTS, CHAT_WS_NAMESPACE, CHAT_WS_SERVER_EVENTS } from '@bible-arena/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { apiClient, getAccessToken } from './api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
/** Fallback resync in case a `chat:message` push is missed (a brief
 * disconnect, a tab that was backgrounded) — the socket is still the primary
 * delivery path, this just guards against silent drift. */
const CONVERSATIONS_POLL_MS = 20000;

/** `'closed'`: just the floating icon. `'list'`: the conversation list is
 * expanded. `{ friendUserId }`: one specific thread is open — reached either
 * by tapping a conversation in the list, or directly from anywhere else in
 * the app (e.g. a player's action sheet) via `openThread`. */
export type ChatPanelState = 'closed' | 'list' | { friendUserId: string; nickname?: string | null };

interface ChatContextValue {
  conversations: ChatConversationView[];
  unreadTotal: number;
  /** Only meaningful for the "am I even connected" indicator — sending
   * doesn't need to check this, the gateway just drops it if not. */
  connected: boolean;
  sendMessage: (toUserId: string, body: string) => void;
  /** Subscribe to every incoming/outgoing message as it arrives live — used
   * by an open thread to append without waiting for a REST refetch. Returns
   * an unsubscribe function. */
  onMessage: (cb: (event: ChatMessageEvent) => void) => () => void;
  refreshConversations: () => Promise<void>;
  panelState: ChatPanelState;
  openList: () => void;
  openThread: (friendUserId: string, nickname?: string | null) => void;
  closePanel: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

/**
 * App-wide chat connection — mounted once (inside `AuthGate`, so always
 * authenticated) rather than per-open-thread, so the floating chat icon's
 * unread badge and conversation previews stay live no matter where in the
 * app the user currently is, mirroring `IncomingChallengesProvider`'s
 * always-on-in-the-background role but over a persistent socket instead of
 * polling, since chat needs actual real-time delivery.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<ChatConversationView[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const listenersRef = useRef<Set<(event: ChatMessageEvent) => void>>(new Set());

  const refreshConversations = useCallback(async () => {
    try {
      const data = await apiClient.get<ChatConversationView[]>('/chat/conversations');
      setConversations(data);
    } catch {
      // Best-effort — the next poll tick or socket push will retry.
    }
  }, []);

  useEffect(() => {
    function fetchInitial() {
      void refreshConversations();
    }
    fetchInitial();
    const interval = setInterval(() => void refreshConversations(), CONVERSATIONS_POLL_MS);
    return () => clearInterval(interval);
  }, [refreshConversations]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return undefined;

    const socket = io(`${API_URL}${CHAT_WS_NAMESPACE}`, {
      auth: { token },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    function handleConnect() {
      setConnected(true);
    }
    function handleDisconnect() {
      setConnected(false);
    }
    function handleMessage(event: ChatMessageEvent) {
      for (const cb of listenersRef.current) cb(event);
      // Simplest-correct approach: re-fetch the whole list rather than
      // patching one conversation's preview/unread-count in place — a chat
      // message is not a hot path, and this stays right even for a friend
      // who wasn't in the list yet (a request just accepted, say).
      void refreshConversations();
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on(CHAT_WS_SERVER_EVENTS.message, handleMessage);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off(CHAT_WS_SERVER_EVENTS.message, handleMessage);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [refreshConversations]);

  const sendMessage = useCallback((toUserId: string, body: string) => {
    socketRef.current?.emit(CHAT_WS_EVENTS.send, { toUserId, body });
  }, []);

  const onMessage = useCallback((cb: (event: ChatMessageEvent) => void) => {
    listenersRef.current.add(cb);
    return () => {
      listenersRef.current.delete(cb);
    };
  }, []);

  const unreadTotal = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  const [panelState, setPanelState] = useState<ChatPanelState>('closed');
  const openList = useCallback(() => setPanelState('list'), []);
  const openThread = useCallback(
    (friendUserId: string, nickname?: string | null) => setPanelState({ friendUserId, nickname }),
    [],
  );
  const closePanel = useCallback(() => setPanelState('closed'), []);

  const value = useMemo(
    () => ({
      conversations,
      unreadTotal,
      connected,
      sendMessage,
      onMessage,
      refreshConversations,
      panelState,
      openList,
      openThread,
      closePanel,
    }),
    [
      conversations,
      unreadTotal,
      connected,
      sendMessage,
      onMessage,
      refreshConversations,
      panelState,
      openList,
      openThread,
      closePanel,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
