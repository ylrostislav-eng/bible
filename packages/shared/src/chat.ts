export const CHAT_MESSAGE_MAX_LENGTH = 2000;
export const CHAT_MESSAGES_PAGE_SIZE = 30;

export interface ChatMessageView {
  id: string;
  fromUserId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

/** One page of a conversation's history, newest-first request but returned
 * oldest-first within the page so the client can just append it above the
 * existing list. Pass `nextCursor` back as `?before=` to load older messages;
 * `null` means there's nothing older left. */
export interface ChatMessagesPage {
  messages: ChatMessageView[];
  nextCursor: string | null;
}

export interface ChatConversationView {
  friendUserId: string;
  nickname: string | null;
  avatarUrl: string | null;
  online: boolean;
  lastMessage: {
    body: string;
    createdAt: string;
    fromMe: boolean;
  } | null;
  /** Messages from this friend you haven't fetched/viewed yet. */
  unreadCount: number;
}

export interface SendChatMessageInput {
  body: string;
}

/** Socket.IO namespace the chat gateway listens on. */
export const CHAT_WS_NAMESPACE = '/chat';

/** Client -> server event names.
 * - `chat:send`: `{ toUserId: string, body: string }` */
export const CHAT_WS_EVENTS = {
  send: 'chat:send',
} as const;

/** Server -> client event names.
 * - `chat:message`: `ChatMessageView & { toUserId: string }` — pushed to
 *   every connected socket of both the sender and the recipient, whenever a
 *   message is created (via this event or the REST fallback). The client
 *   figures out which conversation it belongs to from whichever of
 *   `fromUserId`/`toUserId` isn't its own id.
 * - `chat:error`: `{ message: string }` — a send failed (not friends,
 *   blocked, empty/too-long body); the socket connection itself stays up. */
export const CHAT_WS_SERVER_EVENTS = {
  message: 'chat:message',
  error: 'chat:error',
} as const;

export interface ChatMessageEvent extends ChatMessageView {
  toUserId: string;
}
