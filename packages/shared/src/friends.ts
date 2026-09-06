/** How a searched-up user relates to the person doing the search — drives
 * which action button (if any) the search result shows. */
export type FriendRelation = 'none' | 'friend' | 'incoming' | 'outgoing' | 'self';

export interface FriendView {
  userId: string;
  nickname: string | null;
  avatarUrl: string | null;
  level: number;
  rating: number;
  title: string;
  online: boolean;
}

/** The other person in a pending request — `id` is the request's own id
 * (used to accept/decline), `userId` is who it's with. */
export interface FriendRequestView {
  id: string;
  userId: string;
  nickname: string | null;
  avatarUrl: string | null;
  level: number;
  rating: number;
  title: string;
  createdAt: string;
}

export interface FriendsListResponse {
  friends: FriendView[];
  incomingRequests: FriendRequestView[];
  outgoingRequests: FriendRequestView[];
}

export interface FriendSearchResult {
  userId: string;
  nickname: string | null;
  avatarUrl: string | null;
  level: number;
  rating: number;
  title: string;
  relation: FriendRelation;
}

export interface SendFriendRequestInput {
  toUserId: string;
}

/**
 * Откуда взялась подсказка. Показывается строкой под ником — без причины
 * список незнакомых имён выглядит случайным, и его пролистывают.
 *
 * `played` — уже играли вместе; `mutual` — есть общие друзья.
 */
export type FriendSuggestionReason = 'played' | 'mutual';

export interface FriendSuggestion {
  userId: string;
  nickname: string | null;
  avatarUrl: string | null;
  level: number;
  rating: number;
  title: string;
  online: boolean;
  reason: FriendSuggestionReason;
  /** Для `played` — сколько партий вместе, для `mutual` — сколько общих
   * друзей. Ноль сюда не попадает: подсказка без основания не подсказка. */
  count: number;
}
