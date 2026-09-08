'use client';

import {
  ALIAS_CATEGORIES,
  ALIAS_CATEGORY_LABELS,
  ALIAS_DIFFICULTIES,
  ALIAS_DIFFICULTY_LABELS,
  ALIAS_TESTAMENTS,
  BIBLE_BOOKS,
  CONTENT_KIND_LABELS,
  DIFFICULTIES,
  DIFFICULTY_NAMES,
  QUESTION_OPTIONS_COUNT,
  TESTAMENTS,
  TESTAMENT_NAMES,
  isGameMasterRole,
  type ContentItem,
  type ContentKind,
} from '@bible-arena/shared';
import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { ApiError, apiClient } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

/**
 * Одна форма правки на все места, откуда правят.
 *
 * ## Почему форма одна
 *
 * Править приходится из двух мест — из вкладки «Контент» и карандашом
 * прямо в партии, — и это не повод писать две формы. Разъедутся они
 * мгновенно: проверку добавят в одну, поле — в другую, и правка из игры
 * начнёт молча ронять то, что бережёт правка из списка.
 *
 * ## Что здесь стоит понимать
 *
 * **Шлём только изменённое.** Форма помнит, какой карточка приехала, и
 * отправляет разницу. Две открытые вкладки иначе затирали бы работу друг
 * друга целиком; так — только по общему полю.
 *
 * **Верный ответ выбирается радиокнопкой рядом с вариантом**, а не
 * номером в отдельном поле. Номер требует держать в голове, с нуля идёт
 * счёт или с единицы, — и ровно здесь и появляются вопросы с ответом,
 * показывающим не туда.
 *
 * **Кнопка сохранения не гаснет от прозрачности**, а меняет цвет: под ней
 * бывают обои режима, и полупрозрачная надпись на светлом пятне
 * нечитаема (то же решение, что у `Button`).
 */
export function ContentEditor({
  kind,
  id,
  onSaved,
  onDeleted,
}: {
  kind: ContentKind;
  /** Пусто — создаём новое. */
  id?: string;
  onSaved?: (item: ContentItem) => void;
  onDeleted?: () => void;
}) {
  const { user } = useAuth();
  const master = isGameMasterRole(user?.role);

  const [item, setItem] = useState<ContentItem | null>(null);
  const [draftItem, setDraftItem] = useState<ContentItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      const blank = blankItem(kind);
      setItem(blank);
      setDraftItem(blank);
      return;
    }
    try {
      const loaded = await apiClient.get<ContentItem>(`/admin/content/${kind}/${id}`);
      setItem(loaded);
      setDraftItem(loaded);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось открыть');
    }
  }, [kind, id]);

  // Через таймер: React Compiler не разрешает `setState` в теле эффекта.
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (!draftItem) {
    return error ? (
      <p className="text-sm text-danger">{error}</p>
    ) : (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }

  const patch = (next: Partial<ContentItem>) => {
    setSaved(false);
    setDraftItem({ ...draftItem, ...next } as ContentItem);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = id ? diff(item, draftItem) : withoutKind(draftItem);
      const result = id
        ? await apiClient.patch<ContentItem>(`/admin/content/${kind}/${id}`, body)
        : await apiClient.post<ContentItem>(`/admin/content/${kind}`, body);
      setItem(result);
      setDraftItem(result);
      setSaved(true);
      onSaved?.(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.delete(`/admin/content/${kind}/${id}`);
      onDeleted?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось удалить');
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {draftItem.kind === 'ALIAS_WORD' ? (
        <WordFields item={draftItem} onChange={patch} />
      ) : (
        <QuestionFields item={draftItem} onChange={patch} />
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && !error && <p className="text-sm text-success">Сохранено</p>}

      <button
        onClick={() => void save()}
        disabled={busy}
        className="h-11 rounded-xl bg-primary text-sm font-semibold text-on-primary disabled:bg-surface-hover disabled:text-text-muted"
      >
        {busy ? 'Сохраняем…' : id ? 'Сохранить' : 'Добавить'}
      </button>

      {id && master && (
        <div className="flex flex-col gap-2 rounded-xl border border-danger/40 p-2">
          {confirmDelete ? (
            <>
              <p className="text-xs text-danger">
                {kind === 'GAME_QUESTION'
                  ? 'Вопрос уйдёт в черновик и перестанет попадаться игрокам. Сыгранные партии останутся целы.'
                  : 'Удалить насовсем? Вернуть будет нельзя.'}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => void remove()}
                  disabled={busy}
                  className="h-9 flex-1 rounded-lg bg-danger text-xs font-semibold text-bg disabled:opacity-50"
                >
                  {kind === 'GAME_QUESTION' ? 'В черновик' : 'Удалить'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="h-9 flex-1 rounded-lg bg-surface-hover text-xs font-semibold text-text-secondary"
                >
                  Отмена
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="h-9 text-xs font-semibold text-danger"
            >
              {kind === 'GAME_QUESTION' ? 'Убрать из игры' : 'Удалить'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function QuestionFields({
  item,
  onChange,
}: {
  item: ContentItem;
  onChange: (next: Partial<ContentItem>) => void;
}) {
  if (item.kind === 'ALIAS_WORD') return null;
  const game = item.kind === 'GAME_QUESTION' ? item : null;

  return (
    <>
      <Field label="Вопрос">
        <textarea
          value={item.text}
          onChange={(e) => onChange({ text: e.target.value } as Partial<ContentItem>)}
          rows={3}
          className="w-full rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:border-primary"
        />
      </Field>

      <Field label="Варианты — отметьте верный">
        <div className="flex flex-col gap-2">
          {Array.from({ length: QUESTION_OPTIONS_COUNT }, (_, i) => (
            <label key={i} className="flex items-start gap-2">
              <input
                type="radio"
                name="correct"
                checked={item.correctIndex === i}
                onChange={() => onChange({ correctIndex: i } as Partial<ContentItem>)}
                className="mt-2.5 h-5 w-5 shrink-0 accent-primary"
                aria-label={`Верный ответ — вариант ${i + 1}`}
              />
              {/* Поле в две строки, а не в одну: варианты бывают длинными
                  («Всякую нужду вашу, по богатству Своему в славе…»), и в
                  однострочном поле правится вслепую — видно треть. */}
              <textarea
                value={item.options[i] ?? ''}
                rows={2}
                onChange={(e) => {
                  const options = [...item.options];
                  while (options.length < QUESTION_OPTIONS_COUNT) options.push('');
                  options[i] = e.target.value;
                  onChange({ options } as Partial<ContentItem>);
                }}
                placeholder={`Вариант ${i + 1}`}
                className={clsx(
                  'min-w-0 flex-1 rounded-lg border bg-surface px-3 py-2 text-sm outline-none focus:border-primary',
                  item.correctIndex === i ? 'border-primary' : 'border-border',
                )}
              />
            </label>
          ))}
        </div>
      </Field>

      <Field label="Пояснение — его видят после ответа">
        <textarea
          value={item.explanation}
          onChange={(e) => onChange({ explanation: e.target.value } as Partial<ContentItem>)}
          rows={3}
          className="w-full rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:border-primary"
        />
      </Field>

      {game ? (
        <>
          <div className="flex gap-2">
            <Field label="Книга" className="flex-1">
              <input
                value={game.book}
                onChange={(e) => onChange({ book: e.target.value } as Partial<ContentItem>)}
                className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
              />
            </Field>
            <Field label="Глава" className="w-24">
              <input
                value={game.chapter ?? ''}
                inputMode="numeric"
                onChange={(e) =>
                  onChange({
                    chapter: e.target.value ? Number(e.target.value) : null,
                  } as Partial<ContentItem>)
                }
                className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
              />
            </Field>
          </div>

          <div className="flex gap-2">
            <Field label="Завет" className="flex-1">
              <select
                value={game.testament}
                onChange={(e) => onChange({ testament: e.target.value } as Partial<ContentItem>)}
                className="h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary"
              >
                {TESTAMENTS.map((t) => (
                  <option key={t} value={t}>
                    {TESTAMENT_NAMES[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Сложность" className="flex-1">
              <select
                value={game.difficulty}
                onChange={(e) => onChange({ difficulty: e.target.value } as Partial<ContentItem>)}
                className="h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary"
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {DIFFICULTY_NAMES[d]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={game.draft}
              onChange={(e) => onChange({ draft: e.target.checked } as Partial<ContentItem>)}
              className="h-5 w-5 accent-primary"
            />
            Черновик — не попадается игрокам
          </label>

          {game.usageCount > 0 && (
            <p className="text-xs text-text-muted">
              Показан {game.usageCount} раз, ошиблись {game.errorCount}
            </p>
          )}
        </>
      ) : item.kind === 'CHAPTER_QUESTION' ? (
        <div className="flex gap-2">
          <Field label="Книга" className="flex-1">
            <select
              value={item.bookId}
              onChange={(e) => onChange({ bookId: Number(e.target.value) } as Partial<ContentItem>)}
              className="h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary"
            >
              {BIBLE_BOOKS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Глава" className="w-24">
            <input
              value={String(item.chapter)}
              inputMode="numeric"
              onChange={(e) =>
                onChange({ chapter: Number(e.target.value) || 1 } as Partial<ContentItem>)
              }
              className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
            />
          </Field>
        </div>
      ) : null}
    </>
  );
}

function WordFields({
  item,
  onChange,
}: {
  item: ContentItem;
  onChange: (next: Partial<ContentItem>) => void;
}) {
  if (item.kind !== 'ALIAS_WORD') return null;

  return (
    <>
      <Field label="Слово">
        <input
          value={item.word}
          onChange={(e) => onChange({ word: e.target.value } as Partial<ContentItem>)}
          className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
        />
      </Field>

      <Field label="Пояснение — по нему угадывают">
        <textarea
          value={item.gloss}
          onChange={(e) => onChange({ gloss: e.target.value } as Partial<ContentItem>)}
          rows={3}
          className="w-full rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:border-primary"
        />
      </Field>

      <Field label="Ещё принимается — через запятую">
        <input
          value={item.accepts.join(', ')}
          onChange={(e) =>
            onChange({
              accepts: e.target.value
                .split(',')
                .map((a) => a.trim())
                .filter(Boolean),
            } as Partial<ContentItem>)
          }
          placeholder="Навин, Иешуа"
          className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
        />
      </Field>

      <div className="flex gap-2">
        <Field label="Сложность" className="flex-1">
          <select
            value={item.difficulty}
            onChange={(e) => onChange({ difficulty: e.target.value } as Partial<ContentItem>)}
            className="h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary"
          >
            {ALIAS_DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {ALIAS_DIFFICULTY_LABELS[d]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Вид" className="flex-1">
          <select
            value={item.category}
            onChange={(e) => onChange({ category: e.target.value } as Partial<ContentItem>)}
            className="h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary"
          >
            {ALIAS_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {ALIAS_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Завет">
        <select
          value={item.testament}
          onChange={(e) => onChange({ testament: e.target.value } as Partial<ContentItem>)}
          className="h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary"
        >
          {ALIAS_TESTAMENTS.map((t) => (
            <option key={t} value={t}>
              {t === 'OLD' ? 'Ветхий' : t === 'NEW' ? 'Новый' : 'Оба'}
            </option>
          ))}
        </select>
      </Field>

      {/* Место в Писании — три числа вместе или ни одного: половина ссылки
          никуда не ведёт, а переход в читалку строится по всем трём. */}
      <Field label="Место в Писании — книга, глава, стих (или пусто)">
        <div className="flex gap-2">
          <select
            value={item.refBookId ?? ''}
            onChange={(e) =>
              onChange({
                refBookId: e.target.value ? Number(e.target.value) : null,
              } as Partial<ContentItem>)
            }
            className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary"
          >
            <option value="">—</option>
            {BIBLE_BOOKS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <input
            value={item.refChapter ?? ''}
            inputMode="numeric"
            placeholder="гл."
            onChange={(e) =>
              onChange({
                refChapter: e.target.value ? Number(e.target.value) : null,
              } as Partial<ContentItem>)
            }
            className="h-10 w-16 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary"
          />
          <input
            value={item.refVerse ?? ''}
            inputMode="numeric"
            placeholder="ст."
            onChange={(e) =>
              onChange({
                refVerse: e.target.value ? Number(e.target.value) : null,
              } as Partial<ContentItem>)
            }
            className="h-10 w-16 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary"
          />
        </div>
      </Field>
    </>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={clsx('flex flex-col gap-1', className)}>
      <span className="text-xs text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

/** Что реально поменяли — это и уходит на сервер. */
function diff(before: ContentItem | null, after: ContentItem): Record<string, unknown> {
  const a = before as unknown as Record<string, unknown> | null;
  const b = after as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(b)) {
    if (key === 'kind' || key === 'id' || key === 'updatedAt') continue;
    if (!a || JSON.stringify(a[key]) !== JSON.stringify(b[key])) out[key] = b[key];
  }
  return out;
}

function withoutKind(item: ContentItem): Record<string, unknown> {
  const { ...rest } = item as unknown as Record<string, unknown>;
  delete rest.kind;
  delete rest.id;
  delete rest.updatedAt;
  delete rest.usageCount;
  delete rest.errorCount;
  return rest;
}

/** Пустая карточка для «добавить»: поля те же, значения по умолчанию —
 * самые частые, чтобы заполнять пришлось меньше. */
function blankItem(kind: ContentKind): ContentItem {
  if (kind === 'ALIAS_WORD') {
    return {
      kind: 'ALIAS_WORD',
      id: '',
      word: '',
      gloss: '',
      accepts: [],
      difficulty: 'MEDIUM',
      category: 'CONCEPT',
      testament: 'BOTH',
      refBookId: null,
      refChapter: null,
      refVerse: null,
      updatedAt: '',
    };
  }
  if (kind === 'CHAPTER_QUESTION') {
    return {
      kind: 'CHAPTER_QUESTION',
      id: '',
      text: '',
      options: ['', '', '', ''],
      correctIndex: 0,
      explanation: '',
      bookId: 1,
      chapter: 1,
      updatedAt: '',
    };
  }
  return {
    kind: 'GAME_QUESTION',
    id: '',
    text: '',
    options: ['', '', '', ''],
    correctIndex: 0,
    explanation: '',
    testament: 'OLD',
    book: '',
    chapter: null,
    verses: null,
    topic: null,
    difficulty: 'MEDIUM',
    draft: true,
    usageCount: 0,
    errorCount: 0,
    updatedAt: '',
  };
}

export { CONTENT_KIND_LABELS };
