export const ABUSE_REPORT_REASONS = [
  'INSULT',
  'SPAM',
  'INAPPROPRIATE',
  'IMPERSONATION',
  'OTHER',
] as const;

export type AbuseReportReasonValue = (typeof ABUSE_REPORT_REASONS)[number];

/** Shown in the report sheet, in this order — plain wording a child can
 * read, not moderation jargon. */
export const ABUSE_REPORT_REASON_LABELS: Record<AbuseReportReasonValue, string> = {
  INSULT: 'Оскорбляет или угрожает',
  SPAM: 'Спамит или навязывается',
  INAPPROPRIATE: 'Ведёт себя непристойно',
  IMPERSONATION: 'Выдаёт себя за другого',
  OTHER: 'Другое',
};

/**
 * На сколько по умолчанию ограничивают нарушителя, если жалоба
 * подтвердилась.
 *
 * Раньше это был мут в чате. Личной переписки больше нет, и ограничение
 * стало шире: пока оно действует, нельзя звать в игры, слать вызовы и
 * заявки в друзья — то есть всё, чем можно донимать другого человека.
 */
export const DEFAULT_MUTE_HOURS = 24;

export interface AbuseReportView {
  id: string;
  reason: AbuseReportReasonValue;
  comment: string | null;
  reporterNickname: string | null;
  targetUserId: string;
  targetNickname: string | null;
  status: 'PENDING' | 'ACTIONED' | 'DISMISSED';
  createdAt: string;
  /** How many still-pending complaints exist against this same player —
   * lets triage start with whoever the most people are complaining about. */
  pendingAgainstTarget: number;
  targetMutedUntil: string | null;
}
