import type { AppRole } from './admin';

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

/** Личная ссылка-приглашение и то, что по ней откроется. */
export interface InviteLinkResponse {
  /** `null`, пока у сервера нет токена бота — звать некуда. */
  link: string | null;
  /**
   * Откроется ли по ссылке сразу игра, а не бот.
   *
   * Приходит с сервера, потому что зависит от настроек бота, о которых
   * приложение знать не может. Нужно, чтобы подпись под кнопкой обещала
   * ровно то, что случится: приглашающий пересказывает её другу, и
   * расхождение выглядит поломкой у него, а не у нас.
   */
  opensApp: boolean;
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
 * Строка вкладки «Игроки».
 *
 * Отдельно от `FriendView` и `FriendSearchResult`, хотя поля почти те же:
 * у этих двух смысл «мой друг» и «результат поиска», а здесь — «игрок
 * приложения», и различие важно ровно в двух полях ниже.
 */
export interface PlayerView {
  userId: string;
  nickname: string | null;
  avatarUrl: string | null;
  level: number;
  rating: number;
  title: string;
  online: boolean;
  /** Роль — строка показывает значок вместо титула. */
  role: AppRole;
  /** Отношение — для кнопки «Добавить» и раздела «Мои». Дружба больше
   * ничего не разрешает, но остаётся списком своих. */
  relation: FriendRelation;
  /**
   * Можно ли позвать этого игрока в игру.
   *
   * Ложь у детских аккаунтов, которые не добавили тебя сами, и у тех, с
   * кем сработал чёрный список. Кнопка при этом не «запрещена, но
   * нажимается» — сервер проверит то же самое ещё раз.
   */
  canInvite: boolean;
}

export interface PlayersListResponse {
  players: PlayerView[];
  /** Показаны ли не все подходящие — чтобы честно сказать «показаны
   * первые N», а не делать вид, что в приложении столько игроков. */
  truncated: boolean;
}
