'use client';

import {
  CONTENT_KINDS,
  CONTENT_KIND_HINTS,
  CONTENT_KIND_LABELS,
  type ContentKind,
  type ContentListResponse,
} from '@bible-arena/shared';
import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'react';
import { ContentEditor } from '@/components/content/content-editor';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { ApiError, apiClient } from '@/lib/api';

const SEARCH_DEBOUNCE_MS = 350;

/**
 * Правка содержимого из управления: когда правится не то, что попалось в
 * партии, а то, что искали.
 *
 * Список нарочно короткий и с поиском вместо страниц: вопросов больше
 * тысячи, и листать их — не работа. Зато у вопросов игры в подписи стоит
 * «ошибок 12/40» — по этому числу и находится то, что стоит переписать,
 * без всякого поиска.
 */
export function AdminContentPanel() {
  const [kind, setKind] = useState<ContentKind>('GAME_QUESTION');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<ContentListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (k: ContentKind, q: string) => {
    try {
      const url = q.trim()
        ? `/admin/content/${k}?q=${encodeURIComponent(q.trim())}`
        : `/admin/content/${k}`;
      setData(await apiClient.get<ContentListResponse>(url));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить');
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(kind, query), query ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [kind, query, load]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {CONTENT_KINDS.map((value) => (
          <button
            key={value}
            onClick={() => {
              setKind(value);
              setOpenId(null);
              setCreating(false);
              setData(null);
            }}
            className={clsx(
              'flex flex-col items-start rounded-xl px-3 py-2 text-left transition',
              kind === value
                ? 'bg-primary text-on-primary'
                : 'bg-surface-hover text-text-secondary',
            )}
          >
            <span className="text-sm font-semibold">{CONTENT_KIND_LABELS[value]}</span>
            <span
              className={clsx('text-xs', kind === value ? 'text-on-primary/80' : 'text-text-muted')}
            >
              {CONTENT_KIND_HINTS[value]}
            </span>
          </button>
        ))}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={kind === 'ALIAS_WORD' ? 'Слово или пояснение' : 'Текст вопроса, книга, тема'}
        className="h-11 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
      />

      <button
        onClick={() => {
          setCreating(!creating);
          setOpenId(null);
        }}
        className="h-10 rounded-xl bg-surface-hover text-sm font-semibold text-text-secondary"
      >
        {creating ? 'Свернуть' : `Добавить · ${CONTENT_KIND_LABELS[kind].toLowerCase()}`}
      </button>

      {creating && (
        <Card className="flex-col gap-2">
          <ContentEditor
            kind={kind}
            onSaved={() => {
              setCreating(false);
              void load(kind, query);
            }}
          />
        </Card>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {!data && !error && (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}

      {data && (
        <p className="text-xs text-text-muted">
          Найдено: {data.total}
          {data.truncated ? ' · показаны первые' : ''}
        </p>
      )}

      {data?.items.map((row) => (
        <Card key={row.id} className="flex-col gap-2">
          <button
            onClick={() => setOpenId(openId === row.id ? null : row.id)}
            className="flex items-start justify-between gap-2 text-left"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold">{row.title}</p>
              <p className="text-xs text-text-muted">
                {row.subtitle}
                {row.draft ? ' · черновик' : ''}
              </p>
            </div>
            <span className="shrink-0 text-text-secondary">{openId === row.id ? '▴' : '▾'}</span>
          </button>

          {openId === row.id && (
            <div className="border-t border-border pt-3">
              <ContentEditor
                kind={kind}
                id={row.id}
                onSaved={() => void load(kind, query)}
                onDeleted={() => {
                  setOpenId(null);
                  void load(kind, query);
                }}
              />
            </div>
          )}
        </Card>
      ))}

      {data?.items.length === 0 && (
        <p className="py-6 text-center text-sm text-text-secondary">Ничего не нашлось</p>
      )}
    </div>
  );
}
