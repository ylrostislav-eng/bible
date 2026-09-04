'use client';

import {
  HOT_COLD_BAND_LABELS,
  HOT_COLD_DUEL_MAX_GUESSES,
  HOT_COLD_DUEL_SECONDS_PER_GUESS,
  hotColdAttemptsLabel,
  hotColdBand,
  hotColdDuelOutcomeLabel,
  hotColdHeat,
  type HotColdBand,
  type HotColdDuelGuess,
  type HotColdDuelState,
} from '@bible-arena/shared';
import clsx from 'clsx';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DuelCountdown } from '@/components/duel-countdown';
import { BackLink } from '@/components/ui/back-link';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ApiError, apiClient } from '@/lib/api';
import { useActiveGame } from '@/lib/active-game-context';
import { useAuth } from '@/lib/auth-context';
import { useHotColdDuel } from '@/lib/use-hot-cold-duel';

/**
 * Дуэль «горячо-холодно».
 *
 * Экран делится надвое, и это главное решение. Слева свои слова с
 * числами, справа — только числа соперника. Читается это как две шкалы
 * термометра: своя понятная и чужая непонятная, и вторая давит именно
 * тем, что за числом не видно слова.
 *
 * Число соперника при каждом его ходе на мгновение подсвечивается. Без
 * этого главное событие партии — «он подобрался» — проходило бы незаметно
 * для того, кто в этот момент печатает.
 */

const BAND_STYLE: Record<HotColdBand, { bar: string; dot: string; text: string }> = {
  FOUND: { bar: 'bg-success', dot: 'bg-success', text: 'text-success' },
  HOT: { bar: 'bg-danger', dot: 'bg-danger', text: 'text-danger' },
  WARM: { bar: 'bg-warning', dot: 'bg-warning', text: 'text-warning' },
  COLD: { bar: 'bg-primary/60', dot: 'bg-primary/60', text: 'text-primary' },
  ICE: { bar: 'bg-text-muted/40', dot: 'bg-text-muted/40', text: 'text-text-muted' },
};

export default function HotColdDuelPage() {
  const { user } = useAuth();
  const { setActiveGame } = useActiveGame();
  const [duelId, setDuelId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [code, setCode] = useState('');
  const [guess, setGuess] = useState('');
  const [startError, setStartError] = useState<string | null>(null);
  /**
   * Разбор хранится вместе с id дуэли, к которой относится.
   *
   * Иначе его пришлось бы сбрасывать в эффекте при каждой смене партии, а
   * это лишняя перерисовка на ровном месте: достаточно при показе
   * сверить, той ли дуэли этот разбор.
   */
  const [closest, setClosest] = useState<{
    duelId: string;
    items: HotColdDuelGuess[];
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const duel = useHotColdDuel(duelId);
  const { state } = duel;

  // Незакрытая дуэль важнее пустого экрана: человек мог закрыть вкладку
  // посреди партии, и вернуть его надо туда же, а не в меню.
  useEffect(() => {
    apiClient
      .get<{ duelId: string | null }>('/hot-cold/duel/active')
      .then((response) => setDuelId(response.duelId))
      .catch(() => setDuelId(null));
  }, []);

  // Разбор после игры приходит отдельным запросом: до конца партии он и
  // есть ответ, поэтому сервер его просто не отдаёт.
  const duelOver = state?.status === 'FINISHED' || state?.status === 'ABANDONED';
  const finishedId = duelOver ? state.id : null;
  useEffect(() => {
    if (!finishedId) return;
    apiClient
      .get<{ closest: HotColdDuelGuess[] }>(`/hot-cold/duel/${finishedId}/closest`)
      .then((response) => setClosest({ duelId: finishedId, items: response.closest }))
      .catch(() => undefined);
  }, [finishedId]);

  // Активная партия — чтобы вкладка «Играть» возвращала сюда, а входящие
  // вызовы не всплывали посреди гонки. Ровно как в дуэли по вопросам.
  const liveStatus =
    state && (state.status === 'WAITING' || state.status === 'IN_PROGRESS') ? state.status : null;
  useEffect(() => {
    if (duelId && liveStatus) {
      setActiveGame({
        type: 'hot-cold-duel',
        sessionId: duelId,
        status: liveStatus,
      });
    } else if (duelId === null || (state && !liveStatus)) {
      setActiveGame(null);
    }
  }, [duelId, liveStatus, state, setActiveGame]);

  const start = useCallback(async () => {
    setStarting(true);
    setStartError(null);
    try {
      const response = await apiClient.post<{ duelId: string }>('/hot-cold/duel', {});
      setDuelId(response.duelId);
    } catch (err) {
      setStartError(err instanceof ApiError ? err.message : 'Не удалось создать дуэль');
    } finally {
      setStarting(false);
    }
  }, []);

  const join = useCallback(async () => {
    const value = code.trim();
    if (!value) return;
    setStarting(true);
    setStartError(null);
    try {
      const response = await apiClient.post<{ duelId: string }>('/hot-cold/duel/join', {
        code: value,
      });
      setDuelId(response.duelId);
      setCode('');
    } catch (err) {
      setStartError(err instanceof ApiError ? err.message : 'Не удалось войти');
    } finally {
      setStarting(false);
    }
  }, [code]);

  const send = useCallback(() => {
    const value = guess.trim();
    if (!value) return;
    duel.guess(value);
    setGuess('');
    inputRef.current?.focus();
  }, [guess, duel]);

  if (!duelId) {
    return (
      <Lobby
        code={code}
        onCode={setCode}
        onStart={() => void start()}
        onJoin={() => void join()}
        busy={starting}
        error={startError}
      />
    );
  }

  if (!state) {
    return (
      <div className="flex justify-center pt-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6">
      <header className="flex items-start gap-3">
        <BackLink href="/play" label="Назад к играм" />
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-text-muted">Дуэль</p>
          <h1 className="text-2xl font-bold">Горячо-холодно</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Одно слово на двоих, по {HOT_COLD_DUEL_MAX_GUESSES} попыток и{' '}
            {HOT_COLD_DUEL_SECONDS_PER_GUESS} секунд на каждую.
          </p>
        </div>
      </header>

      {state.status === 'WAITING' ? (
        <WaitingCard code={state.inviteCode} onCancel={duel.surrender} />
      ) : (
        <>
          <Scoreboard state={state} moves={duel.opponentMoves} />

          {/* Правила до первого хода — как в одиночной игре. В дуэли их
              надо даже больше: помимо «слово загадано» нужно объяснить,
              почему у соперника видно числа и не видно слов. */}
          {!duelOver && state.guesses.length === 0 && (
            <section className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-sm font-semibold">Слово загадано — кто найдёт первым</p>
              <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
                Пишите русские слова: на каждое игра ответит, какое место оно занимает по близости к
                загаданному из {state.vocabulary.toLocaleString('ru')}. У соперника видно те же
                числа, но не сами слова — подсмотреть не выйдет.
              </p>
            </section>
          )}

          {duelOver ? (
            <FinishedCard
              state={state}
              myUserId={user?.id ?? ''}
              closest={closest?.duelId === state.id ? closest.items : null}
              onLeave={() => setDuelId(null)}
            />
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {/* Часы над полем, а не под ним: смотреть надо туда же,
                    куда печатаешь. */}
                {state.deadlineAt && (
                  <DuelCountdown
                    deadlineAt={state.deadlineAt}
                    serverNow={state.serverNow}
                    seconds={HOT_COLD_DUEL_SECONDS_PER_GUESS}
                  />
                )}
                <input
                  ref={inputRef}
                  value={guess}
                  onChange={(event) => setGuess(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') send();
                  }}
                  maxLength={64}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="Любое слово"
                  aria-label="Слово"
                  className="h-12 rounded-xl border border-border bg-surface px-4 text-base outline-none transition focus:border-primary"
                />
                {/* Показывается всегда только последнее, что случилось со
                    мной: ответ на моё слово или сгоревшее слово. Ключ по
                    `seq` — чтобы сообщение появлялось заново на каждое
                    событие, даже когда текст тот же. */}
                {duel.notice?.kind === 'burnt' && (
                  <p key={duel.notice.seq} className="text-sm text-danger" aria-live="polite">
                    Не успели — слово сгорело.
                  </p>
                )}
                {duel.notice?.kind === 'verdict' && (
                  <Verdict key={duel.notice.seq} verdict={duel.notice} />
                )}
                {duel.error && <p className="text-sm text-danger">{duel.error}</p>}
                <Button onClick={send} disabled={guess.trim().length === 0}>
                  Проверить
                </Button>
              </div>
              {/* Соперник ушёл — партию надо чем-то закончить, иначе
                  человек сидит и ждёт неизвестно чего. Право забрать
                  победу проверяет сервер, кнопка лишь предлагает. */}
              {state.canClaimWin && (
                <div className="flex flex-col gap-2 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-center">
                  <p className="text-sm">Соперник не на связи уже пару минут.</p>
                  <Button onClick={duel.claimWin}>Забрать победу</Button>
                </div>
              )}
              <button
                type="button"
                onClick={duel.surrender}
                className="self-center text-xs text-text-muted underline-offset-4 hover:text-text-secondary hover:underline"
              >
                Сдаться
              </button>
            </>
          )}

          <MyGuesses guesses={state.guesses} />
        </>
      )}
    </div>
  );
}

/** Пока дуэли нет: создать свою или войти по чужому коду. */
function Lobby({
  code,
  onCode,
  onStart,
  onJoin,
  busy,
  error,
}: {
  code: string;
  onCode: (value: string) => void;
  onStart: () => void;
  onJoin: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-6">
      <header className="flex items-start gap-3">
        <BackLink href="/play" label="Назад к играм" />
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-text-muted">Дуэль</p>
          <h1 className="text-2xl font-bold">Горячо-холодно</h1>
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-sm leading-relaxed text-text-secondary">
          Двое ищут одно и то же слово. Вы видите, на каком месте стоят слова соперника, но не сами
          слова — так что подсмотреть не выйдет, а вот понервничать придётся.
        </p>
      </section>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button onClick={onStart} disabled={busy}>
        {busy ? <Spinner /> : 'Создать дуэль'}
      </Button>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Или войти по коду</p>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(event) => onCode(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onJoin();
            }}
            maxLength={12}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="Код"
            aria-label="Код дуэли"
            className="h-12 flex-1 rounded-xl border border-border bg-surface px-4 text-base uppercase tracking-widest outline-none transition focus:border-primary"
          />
          <button
            type="button"
            onClick={onJoin}
            disabled={busy || code.trim().length === 0}
            className="shrink-0 rounded-xl bg-surface-hover px-5 text-sm font-semibold transition hover:bg-border disabled:opacity-40"
          >
            Войти
          </button>
        </div>
      </div>
    </div>
  );
}

/** Ждём второго: код крупно, потому что его сейчас будут диктовать. */
function WaitingCard({ code, onCancel }: { code: string; onCancel: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Буфер может быть недоступен — код и так на экране крупно.
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-border bg-surface p-5 text-center">
        <p className="text-sm text-text-secondary">Код для соперника</p>
        <p className="mt-2 text-4xl font-bold tracking-[0.3em]">{code}</p>
        <button
          type="button"
          onClick={() => void copy()}
          className="mt-3 rounded-xl bg-surface-hover px-4 py-2 text-xs font-semibold transition hover:bg-border"
        >
          {copied ? 'Скопировано' : 'Скопировать'}
        </button>
      </section>
      <div className="flex items-center justify-center gap-2 text-sm text-text-secondary">
        <Spinner />
        Ждём соперника…
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="self-center text-xs text-text-muted underline-offset-4 hover:text-text-secondary hover:underline"
      >
        Отменить
      </button>
    </div>
  );
}

/**
 * Две шкалы рядом: своя и чужая.
 *
 * Чужая — то, ради чего режим и существует. Показывается только лучшее
 * место соперника и число ходов: этого хватает, чтобы понять «он близко»,
 * и не хватает, чтобы что-то списать.
 */
function Scoreboard({ state, moves }: { state: HotColdDuelState; moves: number }) {
  const opponent = state.opponent;
  return (
    <section className="grid grid-cols-2 gap-2">
      <Side title="Вы" best={state.bestRank} moves={state.guesses.length} solved={state.solved} />
      {/* Ключ по числу ходов соперника перезапускает анимацию на каждый
          его ход — тем же приёмом, что отсчёт перед дуэлью. Эффект с
          таймером ради одного мигания стоил бы лишней перерисовки на
          каждое чужое слово. */}
      <Side
        key={moves}
        title={opponent?.nickname ?? 'Соперник'}
        best={opponent?.bestRank ?? null}
        moves={opponent?.guessCount ?? 0}
        solved={opponent?.solved ?? false}
        offline={opponent ? !opponent.online : false}
        flash={moves > 0}
      />
    </section>
  );
}

function Side({
  title,
  best,
  moves,
  solved,
  offline,
  flash,
}: {
  title: string;
  best: number | null;
  moves: number;
  solved: boolean;
  offline?: boolean;
  flash?: boolean;
}) {
  const band = best === null ? null : hotColdBand(best);
  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-2xl border border-border bg-surface px-3 py-3',
        flash && 'hot-cold-rival-flash',
      )}
    >
      {band && (
        <span
          className={clsx('absolute inset-y-0 left-0 opacity-15', BAND_STYLE[band].bar)}
          style={{ width: `${Math.round(hotColdHeat(best as number) * 100)}%` }}
          aria-hidden
        />
      )}
      <div className="relative">
        <p className="truncate text-xs text-text-secondary">
          {title}
          {offline && <span className="text-text-muted"> · отошёл</span>}
        </p>
        <p
          className={clsx(
            'mt-1 text-2xl font-bold tabular-nums',
            band ? BAND_STYLE[band].text : 'text-text-muted',
          )}
        >
          {solved ? 'Нашёл' : (best ?? '—')}
        </p>
        <p className="text-xs text-text-muted">{hotColdAttemptsLabel(moves)}</p>
      </div>
    </div>
  );
}

function Verdict({
  verdict,
}: {
  verdict: { rank: number | null; understood: string | null; repeat: boolean };
}) {
  if (verdict.rank === null) {
    return (
      <p className="text-sm text-text-secondary" aria-live="polite">
        Такого слова я не знаю. Попробуйте другое — или проверьте опечатку.
      </p>
    );
  }
  const band = hotColdBand(verdict.rank);
  return (
    <p className="text-sm" aria-live="polite">
      {verdict.understood && (
        <span className="text-text-secondary">Понял как «{verdict.understood}». </span>
      )}
      {verdict.repeat && <span className="text-text-secondary">Это слово уже было. </span>}
      <span className={clsx('font-semibold', BAND_STYLE[band].text)}>
        {HOT_COLD_BAND_LABELS[band]}
      </span>
    </p>
  );
}

/** Свои догадки — со словами. Чужих здесь нет и быть не может. */
function MyGuesses({ guesses }: { guesses: HotColdDuelGuess[] }) {
  if (guesses.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
        Здесь появятся ваши слова — ближайшее сверху.
      </p>
    );
  }
  return (
    // Запас снизу: под списком нижнее меню и кнопка чата.
    <ul className="flex flex-col gap-1.5 pb-28">
      {guesses.map((entry) => {
        const band = hotColdBand(entry.rank);
        const style = BAND_STYLE[band];
        return (
          <li
            key={entry.word}
            className="relative overflow-hidden rounded-xl border border-border bg-surface px-3 py-2.5"
          >
            <span
              className={clsx('absolute inset-y-0 left-0 opacity-15', style.bar)}
              style={{ width: `${Math.round(hotColdHeat(entry.rank) * 100)}%` }}
              aria-hidden
            />
            <span className="relative flex items-center gap-2">
              <span className={clsx('h-2 w-2 shrink-0 rounded-full', style.dot)} aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium">{entry.word}</span>
              <span className={clsx('shrink-0 text-sm font-semibold tabular-nums', style.text)}>
                {entry.rank}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function FinishedCard({
  state,
  myUserId,
  closest,
  onLeave,
}: {
  state: HotColdDuelState;
  myUserId: string;
  closest: HotColdDuelGuess[] | null;
  onLeave: () => void;
}) {
  const won = state.winnerId === myUserId;
  return (
    <div className="flex flex-col gap-4">
      <section
        className={clsx(
          'rounded-2xl border p-4 text-center',
          won ? 'border-success/40 bg-success/10' : 'border-border bg-surface',
        )}
      >
        <p className="text-sm font-semibold">{hotColdDuelOutcomeLabel(state, myUserId)}</p>
        <p className="mt-2 text-sm text-text-secondary">Загадано было</p>
        <p className="mt-1 text-3xl font-bold">{state.word}</p>
        {state.gloss && <p className="mt-2 text-sm text-text-secondary">{state.gloss}</p>}
        {state.reward && (
          <p className="mt-3 text-sm font-semibold text-success">
            +{state.reward.xp} XP · {state.reward.ratingDelta >= 0 ? '+' : ''}
            {state.reward.ratingDelta} к знаниям
            {state.reward.ratingCapped && (
              <span className="text-text-muted"> (дневной предел)</span>
            )}
          </p>
        )}
      </section>

      {closest && closest.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
            Что было ближе всего
          </h2>
          <MyGuesses guesses={closest} />
        </section>
      )}

      <section className="flex flex-col gap-2 border-t border-border pt-4">
        <Button onClick={onLeave}>Ещё дуэль</Button>
        <div className="flex gap-2">
          <Link
            href="/hot-cold"
            className="flex-1 rounded-xl bg-surface-hover px-3 py-2.5 text-center text-sm font-semibold transition hover:bg-border"
          >
            Играть одному
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
