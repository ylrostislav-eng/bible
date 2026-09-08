'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiClient } from '@/lib/api';
import { Spinner } from '@/components/ui/spinner';

/**
 * Общая механика всех панелей админки: загрузить, показать ошибку,
 * перезагрузить после действия.
 *
 * Вынесено не ради экономии строк, а ради одинакового поведения: панели
 * писались бы каждая по-своему, и в одной из них ошибка запроса опять
 * оказалась бы проглоченной — это в проекте уже случалось (см. чеклист,
 * «ошибка показывается, а не молча гасится»).
 */
export function useAdminData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setData(await apiClient.get<T>(path));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }, [path]);

  // Через таймер, а не прямым вызовом: React Compiler запрещает
  // `setState` в теле эффекта (`react-hooks/set-state-in-effect`), а
  // загрузка первым делом ставит состояние. Тот же приём уже используется
  // в списке игроков.
  useEffect(() => {
    const timer = setTimeout(() => void reload(), 0);
    return () => clearTimeout(timer);
  }, [reload]);

  return { data, error, loading, reload, setError };
}

export function PanelState({
  loading,
  error,
  empty,
  emptyText,
}: {
  loading: boolean;
  error: string | null;
  empty?: boolean;
  emptyText?: string;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }
  if (error) return <p className="py-4 text-sm text-danger">{error}</p>;
  if (empty) {
    return <p className="py-6 text-center text-sm text-text-secondary">{emptyText}</p>;
  }
  return null;
}

/** Дата и время в одном виде на всю админку: без года, но с минутами —
 * здесь всё про «когда это было сегодня-вчера». */
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
