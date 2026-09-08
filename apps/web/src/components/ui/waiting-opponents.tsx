'use client';

import type { WaitingOpponentsView } from '@bible-arena/shared';
import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

/** Как часто перечитывать очередь, пока экран открыт. */
const REFRESH_MS = 15_000;

/**
 * «Сколько человек сейчас ищет соперника» — рядом с кнопкой поиска.
 *
 * Без этого числа нажатие «Найти соперника» — ставка вслепую: человек
 * встаёт в очередь, ждёт минуту в тишине и решает, что режим сломан, а не
 * что он пришёл первым. С числом решение принимает он сам: ждать, позвать
 * друга по коду или пойти играть одному.
 *
 * Пустая очередь — не ошибка и говорит об этом прямо: «пока никто не
 * ищет — встаньте первым, вас найдут». Ноль, поданный как ноль, отпугнул
 * бы ровно тех, с кого очередь и начинается.
 *
 * ## Почему счётчик свой у каждого режима
 *
 * Общая цифра врала бы обоим: подбор идёт внутри режима, и десять
 * ищущих в «горячо-холодно» не приближают партию в дуэли по вопросам. По
 * той же причине у дуэли считается ещё и число вопросов — сажают только
 * тех, кто просил одинаковое количество.
 */
export function WaitingOpponents({
  endpoint,
  questionCount,
  className,
}: {
  /** Адрес счётчика: у каждого режима свой. */
  endpoint: string;
  /** Для дуэли по вопросам — сколько вопросов выбрано сейчас. */
  questionCount?: number;
  className?: string;
}) {
  const [data, setData] = useState<WaitingOpponentsView | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiClient.get<WaitingOpponentsView>(endpoint));
    } catch {
      // Счётчик — подсказка, а не часть игры: не сумели спросить —
      // молчим. Красная строка об ошибке рядом с кнопкой пугает сильнее,
      // чем помогает отсутствующая цифра.
    }
  }, [endpoint]);

  useEffect(() => {
    // Через таймер даже в первый раз: React Compiler не разрешает менять
    // состояние прямо в теле эффекта (см. чеклист).
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  // До первого ответа считаем очередь пустой: строка всё равно невидима,
  // а ветвление на `null` пришлось бы протаскивать во всю вёрстку ниже.
  const count =
    questionCount !== undefined && data?.byQuestionCount
      ? (data.byQuestionCount[String(questionCount)] ?? 0)
      : (data?.total ?? 0);

  const empty = count === 0;

  // Строка занимает своё место с самого начала и только проявляется, когда
  // ответ пришёл. Иначе она возникает через полсекунды и толкает кнопку
  // вниз — глазами это читается как подёргивание экрана, а палец к тому
  // моменту уже летит к прежнему месту кнопки.
  return (
    <p
      className={clsx(
        'flex min-h-6 items-center justify-center text-xs transition-opacity duration-200',
        data ? 'opacity-100' : 'opacity-0',
        className,
      )}
      aria-live="polite"
      aria-hidden={!data}
    >
      {/* Подложка по ширине текста: строка лежит на картинке экрана, и без
          неё светлые места обоев съедают половину букв. Плашка узкая и
          полупрозрачная — читаемость, а не ещё одна карточка. */}
      <span
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 backdrop-blur-[2px]',
          empty ? 'text-text-secondary' : 'text-primary',
        )}
      >
        <PeopleIcon />
        {empty ? (
          'Пока никто не ищет — встаньте первым, вас найдут'
        ) : (
          <>
            {/* Просто число. Приписки про число вопросов здесь стояли зря:
                выбрать его на этом экране нельзя — у всех одинаковые, — и
                уточнение отвечало на вопрос, которого человек не задавал.
                На подсчёт это не влияет: сервер по-прежнему считает только
                тех, кто ждёт партию тех же правил. */}
            Сейчас ищут: <span className="font-semibold">{count}</span>
          </>
        )}
      </span>
    </p>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M16 6.2a3.2 3.2 0 0 1 0 6M17.5 14.4c2 .6 3.5 2.3 3.5 4.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}
