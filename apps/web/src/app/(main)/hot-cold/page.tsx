'use client';

import {
  HOT_COLD_BAND_LABELS,
  hotColdAttemptsLabel,
  hotColdBand,
  hotColdHeat,
  hotColdShareText,
  type HotColdBand,
  type HotColdGuess,
  type HotColdGuessResult,
  type HotColdState,
} from '@bible-arena/shared';
import clsx from 'clsx';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackLink } from '@/components/ui/back-link';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ApiError, apiClient } from '@/lib/api';
import { pluralCoins } from '@/lib/plural';

/**
 * «Горячо-холодно».
 *
 * Главное решение экрана — не показывать голое число как единственный
 * ответ. «2371» человеку не говорит ничего; «тепло» говорит всё. Поэтому у
 * каждой догадки есть полоска и слово, а число стоит рядом как уточнение
 * для тех, кому оно интересно.
 *
 * Список отсортирован по близости, а не по времени: игрок смотрит на него,
 * чтобы понять, куда двигаться, и порядок ходов для этого бесполезен.
 * Последняя догадка при этом подсвечена — иначе она теряется в середине
 * списка, и непонятно, что вообще произошло.
 */

/** Цвета ступеней. Один набор на полоску, точку и подпись. */
const BAND_STYLE: Record<HotColdBand, { bar: string; dot: string; text: string }> = {
  FOUND: { bar: 'bg-success', dot: 'bg-success', text: 'text-success' },
  HOT: { bar: 'bg-danger', dot: 'bg-danger', text: 'text-danger' },
  WARM: { bar: 'bg-warning', dot: 'bg-warning', text: 'text-warning' },
  COLD: { bar: 'bg-primary/60', dot: 'bg-primary/60', text: 'text-primary' },
  ICE: { bar: 'bg-text-muted/40', dot: 'bg-text-muted/40', text: 'text-text-muted' },
};

export default function HotColdPage() {
  const [state, setState] = useState<HotColdState | null>(null);
  const [guess, setGuess] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Последний ответ сервера — чтобы сказать про конкретное слово. */
  const [last, setLast] = useState<HotColdGuessResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Номер партии вынут отдельным значением, а не читается из `state` внутри
  // обработчиков: так в зависимостях стоит число, а не весь объект,
  // меняющийся на каждый ход.
  const round = state?.round;

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<HotColdState>('/hot-cold')
      .then((response) => {
        if (!cancelled) setState(response);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : 'Не удалось загрузить игру');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = useCallback(async () => {
    const value = guess.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiClient.post<HotColdGuessResult>('/hot-cold/guess', {
        guess: value,
        round,
      });
      setState(result.state);
      setLast(result);
      // Поле очищаем только если слово принято: неопознанное лучше оставить,
      // человек его сейчас поправит, а не будет набирать заново.
      if (result.rank !== null) setGuess('');
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось отправить слово');
    } finally {
      setBusy(false);
    }
  }, [guess, busy, round]);

  const dispute = useCallback(
    async (word: string) => {
      // Кнопку не блокируем на время запроса: жалоба — не ход в игре, и
      // ждать ответа сервера, чтобы нажать следующую, незачем.
      try {
        setState(
          await apiClient.post<HotColdState>('/hot-cold/dispute', {
            word,
            round,
          }),
        );
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Не удалось отправить отметку');
      }
    },
    [round],
  );

  /**
   * «Ещё слово» — следующая свободная партия.
   *
   * Список догадок и последний вердикт сбрасываются здесь, а не приходят
   * пустыми с сервера: состояние новой партии он и так пришлёт пустым, но
   * `last` живёт только на клиенте, и без сброса под новым словом висела
   * бы оценка предыдущего.
   */
  const nextWord = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setState(await apiClient.post<HotColdState>('/hot-cold/next', {}));
      setLast(null);
      setGuess('');
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось взять новое слово');
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const takeHint = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setState(await apiClient.post<HotColdState>('/hot-cold/hint', { round }));
      setLast(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось взять подсказку');
    } finally {
      setBusy(false);
    }
  }, [busy, round]);

  if (loadError) {
    return (
      <div className="mx-auto max-w-md px-4 pt-10 text-center">
        <p className="text-sm text-danger">{loadError}</p>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex justify-center pt-16">
        <Spinner />
      </div>
    );
  }

  const best = state.guesses[0] ?? null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6">
      <header className="flex items-start gap-3">
        <BackLink href="/" label="Назад на главную" />
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-text-muted">
            {state.free ? `Своё слово №${state.round}` : formatDate(state.date)}
          </p>
          <h1 className="text-2xl font-bold">Горячо-холодно</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {state.free ? 'Своё слово — играйте сколько хотите.' : 'Слово дня, одно на всех.'}
          </p>
        </div>
      </header>

      {state.finished ? (
        <FinishedCard state={state} onNext={() => void nextWord()} busy={busy} />
      ) : (
        <>
          {/* Правила — до первого хода и только до него.
              Экран без них выглядел так: пустое поле «Любое слово» и
              кнопка «Проверить». Проверить что? Человек, открывший игру
              впервые, не знает даже, что слово загадано, — а это и есть
              вся задача. Тем, кто уже сходил, объяснение не нужно: они
              поняли правила из первого же ответа, и карточка ушла бы в
              шум. */}
          {state.guesses.length === 0 && <HowItWorks state={state} />}

          <div className="flex flex-col gap-2">
            <input
              ref={inputRef}
              value={guess}
              onChange={(event) => setGuess(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit();
              }}
              maxLength={64}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Любое слово"
              aria-label="Слово"
              className="h-12 rounded-xl border border-border bg-surface px-4 text-base outline-none transition focus:border-primary"
            />
            {last && <Verdict result={last} />}
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button onClick={() => void submit()} disabled={busy || guess.trim().length === 0}>
              {busy ? <Spinner /> : 'Проверить'}
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {state.hintsLeft > 0 ? 'Подсказка' : 'Подсказок больше нет'}
              </p>
              {/* Цена названа заранее: узнавать о потере очков после нажатия —
                  всё равно что узнавать о ней от кассира. */}
              <p className="text-xs text-text-muted">
                {state.hintsLeft > 0
                  ? 'Откроет слово вдвое ближе вашего лучшего'
                  : `Сейчас за ответ ${state.rewardIfSolvedNow.xp} XP`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void takeHint()}
              disabled={busy || state.hintsLeft === 0}
              className="shrink-0 rounded-xl bg-surface-hover px-4 py-2 text-sm font-semibold transition hover:bg-border disabled:opacity-40"
            >
              Открыть
            </button>
          </div>
        </>
      )}

      {best && !state.finished && (
        <p className="text-center text-xs text-text-muted">
          Лучшее место: {best.rank} из {state.vocabulary.toLocaleString('ru')} ·{' '}
          {hotColdAttemptsLabel(state.guesses.filter((g) => !g.revealed).length)}
        </p>
      )}

      {state.guesses.length > 0 && (
        // Объяснение стрелки — один раз и мелко. Без него кнопка выглядит
        // как «поднять слово в списке», то есть как читерство.
        <p className="text-center text-xs text-text-muted">
          Не согласны с расстоянием? Нажмите ↑ у слова — это поправит игру
        </p>
      )}

      <GuessList
        guesses={state.guesses}
        highlight={last?.rank ?? null}
        onDispute={(word) => void dispute(word)}
        disputesLeft={state.disputesLeft}
      />
    </div>
  );
}

/**
 * Правила в трёх строках: что загадано слово, что его ищут словами и что
 * число — это близость.
 *
 * Знаменатель назван вслух («из 51 767»), потому что без него «место 2371»
 * читается как «плохо», а на самом деле это уже верхние пять процентов. С
 * ним видно масштаб, и первое же число перестаёт пугать.
 */
function HowItWorks({ state }: { state: HotColdState }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-sm font-semibold">Слово загадано — его надо найти</p>
      <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
        Пишите любые русские слова. На каждое игра ответит, какое место оно занимает по близости к
        загаданному — из {state.vocabulary.toLocaleString('ru')}. Чем меньше число, тем горячее.
        Первое место и есть ответ.
      </p>
      <p className="mt-2 text-xs text-text-muted">Попытки не ограничены, проиграть нельзя.</p>
    </section>
  );
}

/** Что игра поняла и что ответила на последнее слово. */
function Verdict({ result }: { result: HotColdGuessResult }) {
  if (result.rank === null) {
    return (
      <p className="text-sm text-text-secondary" aria-live="polite">
        Такого слова я не знаю. Попробуйте другое — или проверьте опечатку.
      </p>
    );
  }
  const band = hotColdBand(result.rank);
  return (
    <p className="text-sm" aria-live="polite">
      {result.understood && (
        <span className="text-text-secondary">Понял как «{result.understood}». </span>
      )}
      {result.repeat && <span className="text-text-secondary">Это слово уже было. </span>}
      <span className={clsx('font-semibold', BAND_STYLE[band].text)}>
        {HOT_COLD_BAND_LABELS[band]}
      </span>
    </p>
  );
}

/**
 * Список догадок по близости.
 *
 * Полоска здесь — не украшение: она единственное, что читается с одного
 * взгляда. Число рядом нужно тем, кто хочет точности, но игра идёт по
 * полоскам.
 */
function GuessList({
  guesses,
  highlight,
  onDispute,
  disputesLeft,
}: {
  guesses: HotColdGuess[];
  highlight: number | null;
  /** Не передан — значит спорить не с чем: это разбор после игры. */
  onDispute?: (word: string) => void;
  disputesLeft?: number;
}) {
  if (guesses.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
        Здесь появятся ваши слова — ближайшее сверху.
      </p>
    );
  }

  return (
    // Запас снизу: под списком стоят нижнее меню и кнопка чата, и без
    // отступа последние строки уезжают под них — это было видно на
    // первом же снимке экрана с длинным списком.
    <ul className="flex flex-col gap-1.5 pb-28">
      {guesses.map((entry) => {
        const band = hotColdBand(entry.rank);
        const style = BAND_STYLE[band];
        return (
          <li
            key={entry.word}
            className={clsx(
              'relative overflow-hidden rounded-xl border px-3 py-2.5',
              entry.rank === highlight
                ? 'border-primary bg-surface-hover'
                : 'border-border bg-surface',
            )}
          >
            {/* Полоска лежит фоном, а не отдельной строкой: так она не
                съедает высоту, а список остаётся плотным. */}
            <span
              className={clsx('absolute inset-y-0 left-0 opacity-15', style.bar)}
              style={{ width: `${Math.round(hotColdHeat(entry.rank) * 100)}%` }}
              aria-hidden
            />
            <span className="relative flex items-center gap-2">
              <span className={clsx('h-2 w-2 shrink-0 rounded-full', style.dot)} aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium">{entry.word}</span>
              {entry.revealed && (
                <span className="shrink-0 text-[11px] uppercase tracking-wide text-text-muted">
                  подсказка
                </span>
              )}
              <span
                className={clsx('shrink-0 text-sm font-semibold tabular-nums', style.text)}
                title={HOT_COLD_BAND_LABELS[band]}
              >
                {entry.rank}
              </span>
              {/* Кнопка несогласия стоит у каждой строки, а не прячется в
                  меню: промах замечают в ту секунду, когда видят число, и
                  если ради жалобы надо куда-то идти, её не оставят. */}
              {onDispute && (
                <button
                  type="button"
                  onClick={() => onDispute(entry.word)}
                  disabled={entry.disputed || disputesLeft === 0}
                  aria-label={
                    entry.disputed
                      ? `«${entry.word}» — отмечено, что должно быть ближе`
                      : `Отметить, что «${entry.word}» должно быть ближе`
                  }
                  title={entry.disputed ? 'Отмечено — спасибо' : 'Должно быть ближе'}
                  className={clsx(
                    'shrink-0 rounded-lg px-1.5 py-0.5 text-sm transition',
                    entry.disputed
                      ? 'text-success'
                      : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary disabled:opacity-40',
                  )}
                >
                  {entry.disputed ? '✓' : '↑'}
                </button>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function FinishedCard({
  state,
  onNext,
  busy,
}: {
  state: HotColdState;
  onNext: () => void;
  busy: boolean;
}) {
  const guessCount = state.guesses.filter((entry) => !entry.revealed).length;
  const shareText = hotColdShareText({
    solved: state.solved,
    guessCount,
    hintsUsed: state.guesses.filter((entry) => entry.revealed).length,
  });
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Буфер обмена может быть недоступен — молча, текст и так на экране.
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-success/40 bg-success/10 p-4 text-center">
        <p className="text-sm text-text-secondary">Загадано было</p>
        <p className="mt-1 text-3xl font-bold">{state.word}</p>
        {state.gloss && <p className="mt-2 text-sm text-text-secondary">{state.gloss}</p>}
        <p className="mt-3 text-sm font-semibold">{hotColdAttemptsLabel(guessCount)}</p>
        {state.earned && (
          <p className="mt-1 text-sm font-semibold text-success">
            +{state.earned.xp} XP · +{state.earned.coins} {pluralCoins(state.earned.coins)}
          </p>
        )}
      </section>

      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm text-text-secondary">{shareText}</p>
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-xl bg-surface-hover px-3 py-2 text-xs font-semibold transition hover:bg-border"
        >
          {copied ? 'Скопировано' : 'Скопировать'}
        </button>
      </div>

      {state.closest && state.closest.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
            Что было ближе всего
          </h2>
          {/* Разбор после игры — то, ради чего в такую игру возвращаются:
              видно, каким был правильный ход мысли. */}
          <GuessList guesses={state.closest} highlight={null} />
        </section>
      )}

      {/* «Ещё одну» — то, ради чего в такие игры возвращаются. Раньше
          здесь стояла строчка «новое слово — завтра», и на этом игра
          кончалась: пять минут в день и до свидания. */}
      <section className="flex flex-col gap-2 border-t border-border pt-4">
        <Button onClick={onNext} disabled={busy}>
          {busy ? <Spinner /> : 'Ещё слово'}
        </Button>
        {/* Про награду сказано до партии, а не после: узнать, что играл
            вхолостую, постфактум — обидно, даже когда всё честно. */}
        <p className="text-center text-xs text-text-muted">
          {state.freeXpLeft > 0
            ? `Свои слова — сколько угодно. Опыта за них сегодня ещё ${state.freeXpLeft} XP.`
            : 'Свои слова — сколько угодно, но опыт за них на сегодня исчерпан.'}
        </p>
        <div className="flex gap-2">
          <Link
            href="/daily"
            className="flex-1 rounded-xl bg-surface-hover px-3 py-2.5 text-center text-sm font-semibold transition hover:bg-border"
          >
            Слово дня
          </Link>
          <Link
            href="/play"
            className="flex-1 rounded-xl bg-surface-hover px-3 py-2.5 text-center text-sm font-semibold transition hover:bg-border"
          >
            Другие игры
          </Link>
        </div>
      </section>
    </div>
  );
}

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/** `2026-09-04` → «4 сентября». Дата приходит уже локальной для игрока, так
 * что разбираем её как есть, без часовых поясов. */
function formatDate(iso: string): string {
  const [, month, day] = iso.split('-').map(Number);
  return `${day} ${MONTHS[month - 1] ?? ''}`;
}
