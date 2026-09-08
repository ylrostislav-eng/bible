'use client';

import {
  ADMIN_BROADCAST_AUDIENCES,
  ADMIN_BROADCAST_AUDIENCE_LABELS,
  ADMIN_BROADCAST_MAX_LENGTH,
  type AdminBroadcastAudience,
  type AdminBroadcastPreview,
  type AdminBroadcastResult,
} from '@bible-arena/shared';
import clsx from 'clsx';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { ApiError, apiClient } from '@/lib/api';

/**
 * Рассылка в Telegram.
 *
 * Порядок жёсткий и намеренно неудобный: сначала «сколько получит», и
 * только после этого открывается отправка. Рассылку нельзя отозвать, а
 * ошибиться в ней легче всего числом — «всем» и «активным за месяц»
 * выглядят одинаково, пока не увидишь, что за первым стоит вчетверо
 * больше людей.
 *
 * Отправка идёт не мгновенно (Telegram принимает около тридцати
 * сообщений в секунду), поэтому кнопка ждёт ответа и показывает итог:
 * доставлено столько-то, не дошло столько-то.
 */
export function AdminBroadcastPanel() {
  const [audience, setAudience] = useState<AdminBroadcastAudience>('ACTIVE_MONTH');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<AdminBroadcastPreview | null>(null);
  const [result, setResult] = useState<AdminBroadcastResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const askPreview = async (next: AdminBroadcastAudience) => {
    setAudience(next);
    setPreview(null);
    setResult(null);
    setBusy(true);
    try {
      setPreview(
        await apiClient.post<AdminBroadcastPreview>('/admin/broadcast/preview', {
          audience: next,
        }),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось посчитать получателей');
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(
        await apiClient.post<AdminBroadcastResult>('/admin/broadcast', {
          audience,
          text: text.trim(),
        }),
      );
      setText('');
      setPreview(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Рассылка не ушла');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex-col gap-2">
        <p className="text-sm font-semibold text-text-secondary">Кому</p>
        <div className="flex gap-2">
          {ADMIN_BROADCAST_AUDIENCES.map((value) => (
            <button
              key={value}
              onClick={() => void askPreview(value)}
              className={clsx(
                'h-9 flex-1 rounded-lg px-2 text-xs font-semibold transition',
                audience === value
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-hover text-text-secondary',
              )}
            >
              {ADMIN_BROADCAST_AUDIENCE_LABELS[value]}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-muted">
          Пишем только тем, у кого включены уведомления о приглашениях: у заблокировавших бота они
          гаснут сами.
        </p>
        {preview && (
          <p className="text-sm">
            Получат сообщение: <span className="font-bold text-primary">{preview.recipients}</span>
          </p>
        )}
      </Card>

      <Card className="flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, ADMIN_BROADCAST_MAX_LENGTH))}
          rows={6}
          placeholder="Текст сообщения — придёт в личную переписку с ботом"
          className="w-full rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:border-primary"
        />
        <p className="text-right text-xs text-text-muted">
          {text.length}/{ADMIN_BROADCAST_MAX_LENGTH}
        </p>
      </Card>

      {error && <p className="text-sm text-danger">{error}</p>}
      {result && (
        <p className="text-sm text-success">
          Доставлено {result.sent}, не дошло {result.failed}
        </p>
      )}

      {/* Отправка открывается только после подсчёта: увидеть число людей
          до нажатия — единственная защита от рассылки не той аудитории. */}
      <button
        onClick={() => void send()}
        disabled={busy || !preview || preview.recipients === 0 || text.trim().length === 0}
        className="h-12 rounded-xl bg-primary text-sm font-semibold text-on-primary disabled:bg-surface-hover disabled:text-text-muted"
      >
        {busy
          ? 'Отправляем…'
          : preview
            ? `Отправить ${preview.recipients} игрокам`
            : 'Сначала посчитайте получателей'}
      </button>
      {busy && (
        <p className="text-center text-xs text-text-muted">
          Идёт по одному сообщению — на тысячу человек это около минуты. Не закрывайте экран.
        </p>
      )}
    </div>
  );
}
