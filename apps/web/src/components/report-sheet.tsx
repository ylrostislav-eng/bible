'use client';

import {
  ABUSE_REPORT_REASONS,
  ABUSE_REPORT_REASON_LABELS,
  type AbuseReportReasonValue,
} from '@bible-arena/shared';
import { useState } from 'react';
import { ApiError, apiClient } from '@/lib/api';

interface ReportSheetProps {
  targetUserId: string;
  targetNickname: string | null;
  /** Present when reporting one specific message rather than the player in
   * general — the server copies its text into the report so the evidence
   * survives the conversation being deleted. */
  messageId?: string;
  messageBody?: string;
  onClose: () => void;
}

/**
 * Bottom sheet for filing a complaint. Self-contained on purpose: before
 * this existed the only recourse was the personal blacklist, which hides
 * someone from you and tells nobody — so this needs to be reachable from
 * anywhere a player's name appears, without every caller re-implementing
 * the form.
 *
 * Ends on a plain confirmation rather than closing silently: the whole
 * point is that the person reporting knows they were heard.
 */
export function ReportSheet({
  targetUserId,
  targetNickname,
  messageId,
  messageBody,
  onClose,
}: ReportSheetProps) {
  const [reason, setReason] = useState<AbuseReportReasonValue | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.post('/moderation/reports', {
        targetUserId,
        reason,
        messageId,
        comment: comment.trim() || undefined,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось отправить жалобу');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        {sent ? (
          <div className="flex flex-col gap-3 py-2">
            <p className="text-base font-bold">Жалоба отправлена</p>
            <p className="text-sm text-text-secondary">
              Мы её посмотрим. Если этот игрок мешает вам прямо сейчас — добавьте его в чёрный
              список, тогда он не сможет ни писать вам, ни звать в игру.
            </p>
            <button
              onClick={onClose}
              className="h-12 rounded-xl bg-primary text-sm font-semibold text-on-primary"
            >
              Понятно
            </button>
          </div>
        ) : (
          <>
            <div className="mb-1 flex items-center justify-between">
              <p className="truncate text-base font-bold">
                Пожаловаться на {targetNickname ?? 'игрока'}
              </p>
              <button onClick={onClose} className="shrink-0 text-sm text-text-secondary">
                Закрыть
              </button>
            </div>
            <p className="mb-3 text-xs text-text-muted">
              {messageBody ? 'Жалоба на сообщение' : 'Жалоба на игрока'}
            </p>

            {messageBody && (
              <p className="mb-3 max-h-24 overflow-y-auto rounded-xl bg-surface-hover px-3 py-2 text-sm break-words whitespace-pre-wrap text-text-secondary">
                {messageBody}
              </p>
            )}

            <div className="flex flex-col gap-2">
              {ABUSE_REPORT_REASONS.map((value) => (
                <button
                  key={value}
                  onClick={() => setReason(value)}
                  className={
                    reason === value
                      ? 'h-12 rounded-xl border border-primary bg-primary/10 px-3 text-left text-sm font-semibold text-primary'
                      : 'h-12 rounded-xl border border-border px-3 text-left text-sm text-text-primary'
                  }
                >
                  {ABUSE_REPORT_REASON_LABELS[value]}
                </button>
              ))}
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 500))}
              placeholder="Что произошло? (необязательно)"
              rows={3}
              className="mt-3 w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            />

            {error && <p className="mt-2 text-sm text-danger">{error}</p>}

            <button
              onClick={() => void submit()}
              disabled={!reason || busy}
              className="mt-3 h-12 w-full rounded-xl bg-primary text-sm font-semibold text-on-primary disabled:opacity-50"
            >
              {busy ? 'Отправка…' : 'Отправить жалобу'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
