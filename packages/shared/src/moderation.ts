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
  INAPPROPRIATE: 'Пишет непристойное',
  IMPERSONATION: 'Выдаёт себя за другого',
  OTHER: 'Другое',
};

/** How long a mute lasts by default when a complaint is upheld. */
export const DEFAULT_MUTE_HOURS = 24;

export interface AbuseReportView {
  id: string;
  kind: 'USER' | 'MESSAGE';
  reason: AbuseReportReasonValue;
  comment: string | null;
  reporterNickname: string | null;
  targetUserId: string;
  targetNickname: string | null;
  messageBody: string | null;
  status: 'PENDING' | 'ACTIONED' | 'DISMISSED';
  createdAt: string;
  /** How many still-pending complaints exist against this same player —
   * lets triage start with whoever the most people are complaining about. */
  pendingAgainstTarget: number;
  targetMutedUntil: string | null;
}
