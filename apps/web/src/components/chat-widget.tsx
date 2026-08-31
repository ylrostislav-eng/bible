'use client';

import type { ChatMessageEvent, ChatMessageView, ChatMessagesPage } from '@bible-arena/shared';
import { CHAT_MESSAGE_MAX_LENGTH } from '@bible-arena/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiClient } from '@/lib/api';
import { useChat } from '@/lib/chat-context';
import { Spinner } from './ui/spinner';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/**
 * The always-mounted floating chat icon (VK-widget-style, per the reference
 * screenshots) — collapsed by default, expands into either the conversation
 * list or one open thread depending on `useChat().panelState`. Lives once at
 * the `AuthGate` level (like `IncomingChallengeModal`/`BottomNav`) so it
 * follows the user across every screen instead of being page-local.
 */
export function ChatWidget() {
  const { conversations, unreadTotal, panelState, openList, openThread, closePanel } = useChat();

  if (panelState === 'closed') {
    return (
      <button
        onClick={openList}
        className="fixed right-4 bottom-24 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg"
        aria-label="Чаты"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
          <path
            d="M4 4h16v12H8l-4 4V4z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
        {unreadTotal > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-bold text-white">
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed inset-x-3 bottom-20 z-30 mx-auto flex max-h-[70vh] max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
      {panelState === 'list' ? (
        <ConversationList
          conversations={conversations}
          onSelect={(friendUserId, nickname) => openThread(friendUserId, nickname)}
          onClose={closePanel}
        />
      ) : (
        <ChatThread
          friendUserId={panelState.friendUserId}
          nicknameHint={panelState.nickname}
          onBack={openList}
          onClose={closePanel}
        />
      )}
    </div>
  );
}

function ConversationList({
  conversations,
  onSelect,
  onClose,
}: {
  conversations: ReturnType<typeof useChat>['conversations'];
  onSelect: (friendUserId: string, nickname: string | null) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-border p-3">
        <p className="text-sm font-bold">Чаты</p>
        <button onClick={onClose} className="text-sm text-text-secondary">
          Свернуть
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <p className="p-4 text-center text-sm text-text-secondary">
            Пока нет переписок — напишите другу через его профиль
          </p>
        ) : (
          conversations.map((c) => (
            <button
              key={c.friendUserId}
              onClick={() => onSelect(c.friendUserId, c.nickname)}
              className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left hover:bg-surface-hover"
            >
              <span
                className={
                  c.online
                    ? 'h-2 w-2 shrink-0 rounded-full bg-success'
                    : 'h-2 w-2 shrink-0 rounded-full bg-text-muted'
                }
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{c.nickname ?? 'Игрок'}</p>
                <p className="truncate text-xs text-text-secondary">
                  {c.lastMessage
                    ? `${c.lastMessage.fromMe ? 'Вы: ' : ''}${c.lastMessage.body}`
                    : 'Нет сообщений — начните переписку'}
                </p>
              </div>
              {c.unreadCount > 0 && (
                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-on-primary">
                  {c.unreadCount > 99 ? '99+' : c.unreadCount}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </>
  );
}

function ChatThread({
  friendUserId,
  nicknameHint,
  onBack,
  onClose,
}: {
  friendUserId: string;
  nicknameHint?: string | null;
  onBack: () => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { conversations, sendMessage, onMessage, refreshConversations } = useChat();
  const [messages, setMessages] = useState<ChatMessageView[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);

  const nickname =
    nicknameHint ?? conversations.find((c) => c.friendUserId === friendUserId)?.nickname ?? null;

  const loadLatest = useCallback(async () => {
    const page = await apiClient.get<ChatMessagesPage>(`/chat/${friendUserId}/messages`);
    setMessages(page.messages);
    setNextCursor(page.nextCursor);
    void refreshConversations();
  }, [friendUserId, refreshConversations]);

  useEffect(() => {
    function fetchThread() {
      setMessages(null);
      void loadLatest();
    }
    fetchThread();
  }, [loadLatest]);

  useEffect(() => {
    return onMessage((event: ChatMessageEvent) => {
      if (event.fromUserId !== friendUserId && event.toUserId !== friendUserId) return;
      shouldStickToBottomRef.current = true;
      void loadLatest();
    });
  }, [onMessage, friendUserId, loadLatest]);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const loadOlder = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    shouldStickToBottomRef.current = false;
    try {
      const page = await apiClient.get<ChatMessagesPage>(
        `/chat/${friendUserId}/messages?before=${nextCursor}`,
      );
      setMessages((prev) => [...page.messages, ...(prev ?? [])]);
      setNextCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    if (body.length > CHAT_MESSAGE_MAX_LENGTH) {
      setSendError(`Слишком длинное сообщение (максимум ${CHAT_MESSAGE_MAX_LENGTH} символов)`);
      return;
    }
    setSendError(null);
    shouldStickToBottomRef.current = true;
    sendMessage(friendUserId, body);
    setDraft('');
  };

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border p-3">
        <button onClick={onBack} className="text-text-secondary" aria-label="Назад к чатам">
          <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
            <path
              d="M12 4l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <p className="flex-1 truncate text-sm font-bold">{nickname ?? 'Игрок'}</p>
        <button onClick={onClose} className="text-sm text-text-secondary">
          Свернуть
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        {messages === null ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {nextCursor && (
              <button
                onClick={() => void loadOlder()}
                disabled={loadingMore}
                className="mx-auto text-xs text-text-secondary disabled:opacity-50"
              >
                {loadingMore ? 'Загрузка…' : 'Показать более ранние сообщения'}
              </button>
            )}
            {messages.length === 0 && (
              <p className="py-6 text-center text-sm text-text-secondary">
                Ещё нет сообщений — напишите первым
              </p>
            )}
            {messages.map((m) => {
              const mine = m.fromUserId === user?.id;
              return (
                <div key={m.id} className={mine ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className={
                      mine
                        ? 'max-w-[75%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-on-primary'
                        : 'max-w-[75%] rounded-2xl rounded-bl-sm bg-surface-hover px-3 py-2'
                    }
                  >
                    <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                    <p
                      className={
                        mine
                          ? 'mt-0.5 text-right text-[10px] text-on-primary/70'
                          : 'mt-0.5 text-right text-[10px] text-text-muted'
                      }
                    >
                      {formatTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {sendError && <p className="px-3 text-xs text-danger">{sendError}</p>}
      <div className="flex items-center gap-2 border-t border-border p-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
          placeholder="Сообщение…"
          className="h-10 flex-1 rounded-full border border-border bg-bg px-4 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={send}
          disabled={!draft.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary disabled:opacity-50"
          aria-label="Отправить"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
            <path
              d="M3 10h13m0 0l-5-5m5 5l-5 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </>
  );
}
