'use client';

import { ALIAS_TEAM_COLORS } from '@bible-arena/shared';
import clsx from 'clsx';
import { Button } from '@/components/ui/button';
import type { AliasTeamState } from '@/lib/alias/match-state';
import { pluralPoints, pluralRounds } from '@/lib/plural';

/** Общее табло: одинаковое между раундами и в конце партии, чтобы финал не
 * ощущался как другой экран, а как тот же — только с итогом. */
export function AliasScoreboard({
  teams,
  targetScore,
  highlightIndex,
}: {
  teams: AliasTeamState[];
  targetScore: number;
  highlightIndex?: number;
}) {
  const ordered = teams
    .map((team, index) => ({ ...team, index }))
    .sort((a, b) => b.score - a.score);

  return (
    <ul className="flex flex-col gap-2">
      {ordered.map((team) => {
        const color = ALIAS_TEAM_COLORS[team.index % ALIAS_TEAM_COLORS.length];
        // Отрицательный счёт бывает при штрафе за пропуск. Показываем как
        // есть и не рисуем полосу «в минус»: врать табло не должно.
        const progress = Math.max(0, Math.min(1, team.score / targetScore));
        return (
          <li
            key={team.index}
            className={clsx(
              'rounded-2xl border bg-surface px-3 py-3',
              team.index === highlightIndex ? 'border-primary' : 'border-border',
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <span className="truncate text-sm font-semibold">{team.name}</span>
              </span>
              <span className="shrink-0 text-lg font-bold tabular-nums">{team.score}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-hover">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${progress * 100}%`, backgroundColor: color }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Экран между раундами. Он же — момент, когда телефон физически переходит
 * из рук в руки, поэтому имя следующей команды здесь крупнее всего
 * остального: за столом на него смотрят с расстояния вытянутой руки.
 */
export function AliasHandoffScreen({
  teams,
  turnIndex,
  targetScore,
  roundsPlayed,
  onStart,
  onQuit,
}: {
  teams: AliasTeamState[];
  turnIndex: number;
  targetScore: number;
  roundsPlayed: number;
  onStart: () => void;
  onQuit: () => void;
}) {
  const team = teams[turnIndex];
  const color = ALIAS_TEAM_COLORS[turnIndex % ALIAS_TEAM_COLORS.length];

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col gap-6 px-4 pb-6 pt-8">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm uppercase tracking-wide text-text-muted">
          {roundsPlayed === 0 ? 'Начинает' : 'Телефон переходит'}
        </p>
        <p className="text-balance text-4xl font-bold" style={{ color }}>
          {team.name}
        </p>
        <p className="max-w-xs text-sm text-text-secondary">
          Один объясняет, остальные угадывают. Однокоренные слова и перевод — нельзя.
        </p>
        {/* Жест показываем именно здесь: в раунде читать инструкции уже
            некогда, а стрелки на кнопках сами по себе намёк слабый. */}
        <p className="mt-1 text-xs text-text-muted">Свайп вверх — угадали, вниз — пропуск</p>
      </div>

      <AliasScoreboard teams={teams} targetScore={targetScore} highlightIndex={turnIndex} />

      <div className="flex flex-col gap-2">
        <Button onClick={onStart}>Поехали</Button>
        <Button variant="ghost" onClick={onQuit}>
          {roundsPlayed === 0 ? 'Изменить настройки' : 'Закончить партию'}
        </Button>
      </div>
    </div>
  );
}

/** Экран после раунда: счёт уже записан, видно, кто впереди. */
export function AliasBetweenRoundsScreen({
  teams,
  turnIndex,
  targetScore,
  onContinue,
}: {
  teams: AliasTeamState[];
  turnIndex: number;
  targetScore: number;
  onContinue: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-28 pt-8">
      <h1 className="text-xl font-bold">Счёт</h1>
      <AliasScoreboard teams={teams} targetScore={targetScore} highlightIndex={turnIndex} />
      <div className="pb-safe fixed inset-x-0 bottom-0 border-t border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto max-w-md px-4 py-3">
          <Button onClick={onContinue}>Дальше</Button>
        </div>
      </div>
    </div>
  );
}

/** Финал партии. */
export function AliasFinishedScreen({
  teams,
  targetScore,
  roundsPlayed,
  saving,
  saveError,
  onPlayAgain,
  onExit,
}: {
  teams: AliasTeamState[];
  targetScore: number;
  roundsPlayed: number;
  saving: boolean;
  saveError: string | null;
  onPlayAgain: () => void;
  onExit: () => void;
}) {
  const best = Math.max(...teams.map((team) => team.score));
  const winners = teams.filter((team) => team.score === best);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 pb-8 pt-10">
      <div className="text-center">
        <p className="text-sm uppercase tracking-wide text-text-muted">
          {roundsPlayed} {pluralRounds(roundsPlayed)}
        </p>
        <h1 className="text-balance mt-2 text-3xl font-bold">
          {winners.length === 1 ? `Победа: ${winners[0].name}` : 'Ничья'}
        </h1>
        {winners.length > 1 && (
          <p className="mt-1 text-sm text-text-secondary">
            {winners.map((team) => team.name).join(' и ')} — по {best}{' '}
            {pluralPoints(Math.abs(best))}
          </p>
        )}
      </div>

      <AliasScoreboard teams={teams} targetScore={targetScore} />

      {saveError && <p className="text-center text-xs text-danger">{saveError}</p>}

      <div className="flex flex-col gap-2">
        <Button onClick={onPlayAgain} disabled={saving}>
          Ещё партию
        </Button>
        <Button variant="secondary" onClick={onExit}>
          Выйти
        </Button>
      </div>
    </div>
  );
}
