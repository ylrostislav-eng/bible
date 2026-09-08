/**
 * Права над приложением: гейм-мастер и администраторы.
 *
 * ## Две роли, а не одна
 *
 * **Гейм-мастер один.** Это владелец игры; его имя выделено для всех и
 * ему принадлежат необратимые права — удалить аккаунт, поправить чужой
 * баланс, написать всем сразу. Роль ровно одна на приложение: не потому,
 * что двое поссорятся, а потому что «кто здесь главный» должно иметь
 * единственный ответ — и у игроков, и в журнале.
 *
 * **Администраторов может быть несколько.** Они разбирают жалобы, гасят
 * зависшие партии, смотрят ошибки — работа, которой тем больше, чем
 * больше игроков. Того, что нельзя отменить, у них нет.
 *
 * Разделение проходит ровно по этой черте: **обратимое — админам,
 * необратимое — гейм-мастеру**. Ограничение снимается, партия
 * доигрывается заново, разобранная ошибка отмечается обратно; удалённый
 * аккаунт и ушедшая рассылка — нет.
 *
 * ## Кто есть кто
 *
 * `GAME_MASTER_TELEGRAM_ID` — один идентификатор, `ADMIN_TELEGRAM_IDS` —
 * список через запятую. Не флаг в базе намеренно: флагом
 * можно завладеть, дотянувшись до базы или до одного забытого эндпоинта,
 * а переменная окружения меняется только тем, у кого есть доступ к панели
 * развёртывания. Обратная сторона — чтобы выдать права, нужен перезапуск
 * сервиса; для приложения, где администратор один, это верный размен.
 *
 * Ник для этого не годится вовсе: его можно сменить, а освободившийся —
 * занять. Telegram-идентификатор постоянен и принадлежит человеку.
 *
 * ## Чего не может никто из них
 *
 * Написано здесь, потому что список умолчаний важнее списка возможностей:
 *
 *  - **видеть детские аккаунты в общих списках** — детская защита не знает
 *    исключений, иначе она держится на доверии к тому, кто смотрит;
 *  - **читать чужую переписку** — её в приложении нет вовсе;
 *  - **выдать права другому** — только через переменную окружения;
 *  - **тронуть того, кто выше или вровень** — администратор не трогает
 *    администратора и гейм-мастера, гейм-мастер не удаляет сам себя:
 *    ошибка здесь стоила бы доступа к собственному приложению.
 *
 * Всё, что делают оба, попадает в **журнал гейм-мастера**
 * (`AdminActionView`): кто, когда, над кем и что сделал. Не ради
 * недоверия — ради ответа на вопрос «почему у игрока пропали монеты»
 * через месяц после того, как это забылось. Гейм-мастер видит журнал
 * целиком, администратор — свои строки.
 */

export const APP_ROLES = ['GAME_MASTER', 'ADMIN', 'PLAYER'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const APP_ROLE_LABELS: Record<AppRole, string> = {
  GAME_MASTER: 'Гейм-мастер',
  ADMIN: 'Админ',
  PLAYER: 'Игрок',
};

/** Есть ли доступ к экрану управления вообще. */
export function isStaffRole(role: AppRole | null | undefined): boolean {
  return role === 'GAME_MASTER' || role === 'ADMIN';
}

export function isGameMasterRole(role: AppRole | null | undefined): boolean {
  return role === 'GAME_MASTER';
}

/**
 * Что может только гейм-мастер.
 *
 * Списком, а не разбросанными по коду проверками: право, забытое в одном
 * из шести мест, — это ровно тот способ, каким такие правила и текут.
 * Сервер сверяется с этим же перечнем.
 */
export const GAME_MASTER_ONLY_POWERS = ['DELETE_ACCOUNT', 'ADJUST_BALANCE', 'BROADCAST'] as const;
export type GameMasterOnlyPower = (typeof GAME_MASTER_ONLY_POWERS)[number];

export const GAME_MASTER_ONLY_MESSAGE = 'Это может только гейм-мастер';

/** Что видно на сводке — одним экраном, без листания. */
export interface AdminOverview {
  players: {
    total: number;
    online: number;
    /** Зарегистрировались за последние 7 дней. */
    newLastWeek: number;
    /** Детские аккаунты — их не видно в списках, но знать их число надо. */
    children: number;
  };
  games: {
    /** Завершённые партии за сутки по режимам. */
    lastDay: Record<AdminGameMode, number>;
    /** Идут прямо сейчас (лобби и активные). */
    active: number;
  };
  moderation: {
    pendingReports: number;
    mutedNow: number;
  };
  errors: {
    unresolved: number;
    lastDay: number;
  };
  generatedAt: string;
}

export const ADMIN_GAME_MODES = [
  'SOLO',
  'DUEL',
  'ROOM',
  'ALIAS',
  'HOT_COLD',
  'CHAPTER_CHECK',
] as const;
export type AdminGameMode = (typeof ADMIN_GAME_MODES)[number];

export const ADMIN_GAME_MODE_LABELS: Record<AdminGameMode, string> = {
  SOLO: 'Одиночная',
  DUEL: 'Дуэль',
  ROOM: 'Комната',
  ALIAS: 'Alias',
  HOT_COLD: 'Горячо-холодно',
  CHAPTER_CHECK: 'Проверка главы',
};

/** Строка в списке игроков у администратора. */
export interface AdminPlayerRow {
  userId: string;
  nickname: string | null;
  telegramId: string;
  level: number;
  rating: number;
  online: boolean;
  role: AppRole;
  /** Действующее ограничение по жалобам, если есть. */
  mutedUntil: string | null;
  createdAt: string;
}

/** Карточка игрока: всё, что нужно, чтобы разобраться в жалобе или в
 * вопросе «куда делись мои монеты», в одном ответе. */
export interface AdminPlayerCard extends AdminPlayerRow {
  telegramUsername: string | null;
  avatarUrl: string | null;
  country: string | null;
  ageBand: string | null;
  childMode: boolean;
  guardianPinSet: boolean;
  experience: number;
  coins: number;
  title: string;
  gamesPlayed: number;
  duelsPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDrawn: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveAt: string;
  remindersEnabled: boolean;
  inviteNotificationsEnabled: boolean;
  /** Сколько жалоб на него подано и сколько из них ещё не разобрано. */
  reportsAgainst: number;
  reportsPending: number;
}

export interface AdminPlayersResponse {
  players: AdminPlayerRow[];
  /** Показаны не все — уточните поиск. */
  truncated: boolean;
}

/** Идущая прямо сейчас партия — чтобы закрыть зависшую. */
export interface AdminSessionRow {
  sessionId: string;
  mode: AdminGameMode;
  status: string;
  roomName: string | null;
  players: string[];
  createdAt: string;
  startedAt: string | null;
}

export const ADMIN_ACTION_KINDS = [
  'MUTE',
  'UNMUTE',
  'RENAME',
  'ADJUST_BALANCE',
  'DELETE_ACCOUNT',
  'CLOSE_SESSION',
  'BROADCAST',
] as const;
export type AdminActionKind = (typeof ADMIN_ACTION_KINDS)[number];

export const ADMIN_ACTION_LABELS: Record<AdminActionKind, string> = {
  MUTE: 'Ограничение',
  UNMUTE: 'Снято ограничение',
  RENAME: 'Смена ника',
  ADJUST_BALANCE: 'Правка баланса',
  DELETE_ACCOUNT: 'Удаление аккаунта',
  CLOSE_SESSION: 'Закрытие партии',
  BROADCAST: 'Рассылка',
};

export interface AdminActionView {
  id: string;
  kind: AdminActionKind;
  /** Роль на момент действия: права могли смениться, а запись должна
   * остаться такой, какой была. */
  actorRole: AppRole;
  adminNickname: string | null;
  /** Ник на момент действия: аккаунт мог быть удалён, и ссылка на него
   * ничего бы не сказала. */
  targetNickname: string | null;
  targetUserId: string | null;
  summary: string;
  createdAt: string;
}

export const ADMIN_BROADCAST_AUDIENCES = ['ALL', 'ACTIVE_MONTH'] as const;
export type AdminBroadcastAudience = (typeof ADMIN_BROADCAST_AUDIENCES)[number];

export const ADMIN_BROADCAST_AUDIENCE_LABELS: Record<AdminBroadcastAudience, string> = {
  ALL: 'Всем игрокам',
  ACTIVE_MONTH: 'Заходившим за последний месяц',
};

/** Сколько букв влезает в сообщение Telegram — с запасом на подпись. */
export const ADMIN_BROADCAST_MAX_LENGTH = 3000;

export interface AdminBroadcastPreview {
  audience: AdminBroadcastAudience;
  /** Сколько человек получит сообщение. Считается до отправки: рассылку
   * нельзя «отменить на середине», поэтому число показывается заранее. */
  recipients: number;
}

export interface AdminBroadcastResult {
  sent: number;
  failed: number;
}

/** Границы правок баланса: не запрет, а защита от лишнего нуля. */
export const ADMIN_BALANCE_MIN_DELTA = -100000;
export const ADMIN_BALANCE_MAX_DELTA = 100000;
export const ADMIN_MUTE_MAX_HOURS = 24 * 365;

/** Что администратор пишет вместо подтверждения при удалении аккаунта:
 * ник игрока целиком. Кнопка «вы уверены?» на необратимом действии не
 * задерживает руку, а переписанный ник — задерживает. */
export const ADMIN_DELETE_CONFIRM_HINT = 'Введите ник игрока целиком, чтобы подтвердить удаление';
