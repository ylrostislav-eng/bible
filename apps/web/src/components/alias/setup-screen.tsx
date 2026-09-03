'use client';

import {
  ALIAS_CATEGORIES,
  ALIAS_CATEGORY_HINTS,
  ALIAS_CATEGORY_LABELS,
  ALIAS_DIFFICULTIES,
  ALIAS_DIFFICULTY_HINTS,
  ALIAS_DIFFICULTY_LABELS,
  ALIAS_MAX_TEAMS,
  ALIAS_MIN_COMFORTABLE_DECK,
  ALIAS_MIN_TEAMS,
  ALIAS_ROUND_SECONDS_OPTIONS,
  ALIAS_TARGET_SCORE_OPTIONS,
  ALIAS_TEAM_COLORS,
  ALIAS_TEAM_NAMES,
  ALIAS_TESTAMENTS,
  type AliasCategory,
  type AliasDifficulty,
  type AliasSettings,
  type AliasTestament,
} from '@bible-arena/shared';
import clsx from 'clsx';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { pluralTeams, pluralWords } from '@/lib/plural';

const TESTAMENT_LABELS: Record<AliasTestament, string> = {
  OLD: 'Ветхий Завет',
  NEW: 'Новый Завет',
  BOTH: 'Сквозные',
};

interface SetupScreenProps {
  settings: AliasSettings;
  onSettingsChange: (settings: AliasSettings) => void;
  teamNames: string[];
  onTeamNamesChange: (names: string[]) => void;
  /** Сколько слов подходит под текущие фильтры. `null` — ещё считаем. */
  available: number | null;
  starting: boolean;
  error: string | null;
  onStart: () => void;
}

export function AliasSetupScreen({
  settings,
  onSettingsChange,
  teamNames,
  onTeamNamesChange,
  available,
  starting,
  error,
  onStart,
}: SetupScreenProps) {
  const [showMore, setShowMore] = useState(false);

  const update = <K extends keyof AliasSettings>(key: K, value: AliasSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  /** Снятие последней галочки трактуем как «все»: пустой набор не значит
   * «ничего», он значит «я передумал фильтровать». */
  const toggleInList = <T,>(list: T[], value: T, all: readonly T[]): T[] => {
    const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
    return next.length === 0 ? [...all] : next;
  };

  const addTeam = () => {
    if (teamNames.length >= ALIAS_MAX_TEAMS) return;
    const used = new Set(teamNames);
    const fresh =
      ALIAS_TEAM_NAMES.find((name) => !used.has(name)) ?? `Команда ${teamNames.length + 1}`;
    onTeamNamesChange([...teamNames, fresh]);
  };

  const removeTeam = (index: number) => {
    if (teamNames.length <= ALIAS_MIN_TEAMS) return;
    onTeamNamesChange(teamNames.filter((_, i) => i !== index));
  };

  const renameTeam = (index: number, name: string) => {
    onTeamNamesChange(teamNames.map((item, i) => (i === index ? name : item)));
  };

  const namesFilled = teamNames.every((name) => name.trim().length > 0);
  const thinDeck = available !== null && available < ALIAS_MIN_COMFORTABLE_DECK;

  return (
    <div className="pt-safe mx-auto flex max-w-md flex-col gap-6 px-4 pb-36">
      <header className="pt-3">
        <Link
          href="/play"
          className="-ml-1 inline-flex items-center gap-1 py-2 text-sm text-text-secondary transition hover:text-text-primary"
        >
          <span aria-hidden>←</span> К режимам
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Библейский Alias</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Объясняйте слова, не называя их. Один телефон на всю компанию.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <SectionTitle
          title="Команды"
          hint={`${teamNames.length} ${pluralTeams(teamNames.length)}`}
        />
        <div className="flex flex-col gap-2">
          {teamNames.map((name, index) => (
            <TeamRow
              key={index}
              index={index}
              name={name}
              canRemove={teamNames.length > ALIAS_MIN_TEAMS}
              onRename={(value) => renameTeam(index, value)}
              onRemove={() => removeTeam(index)}
            />
          ))}
        </div>
        {teamNames.length < ALIAS_MAX_TEAMS && (
          <button
            type="button"
            onClick={addTeam}
            className="h-11 rounded-xl border border-dashed border-border text-sm font-medium text-text-secondary transition hover:border-primary hover:text-primary"
          >
            + Ещё команда
          </button>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle title="Сложность слов" hint="Про слова, не про вас" />
        <div className="grid grid-cols-2 gap-2">
          <Chip
            selected={settings.difficulty === null}
            onClick={() => update('difficulty', null)}
            label="Вперемешку"
            hint="Всё сразу"
          />
          {ALIAS_DIFFICULTIES.map((level: AliasDifficulty) => (
            <Chip
              key={level}
              selected={settings.difficulty === level}
              onClick={() => update('difficulty', level)}
              label={ALIAS_DIFFICULTY_LABELS[level]}
              hint={ALIAS_DIFFICULTY_HINTS[level]}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle title="Что берём" hint="Можно несколько" />
        <div className="grid grid-cols-2 gap-2">
          {ALIAS_CATEGORIES.map((category: AliasCategory) => (
            <Chip
              key={category}
              selected={settings.categories.includes(category)}
              onClick={() =>
                update('categories', toggleInList(settings.categories, category, ALIAS_CATEGORIES))
              }
              label={ALIAS_CATEGORY_LABELS[category]}
              hint={ALIAS_CATEGORY_HINTS[category]}
              wide={category === 'IDIOM'}
            />
          ))}
        </div>
      </section>

      <div>
        <button
          type="button"
          onClick={() => setShowMore((value) => !value)}
          className="text-sm font-medium text-text-secondary underline decoration-dotted underline-offset-4 transition hover:text-text-primary"
        >
          {showMore ? 'Свернуть настройки' : 'Ещё настройки'}
        </button>
      </div>

      {showMore && (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <SectionTitle title="Раунд" />
            <div className="grid grid-cols-4 gap-2">
              {ALIAS_ROUND_SECONDS_OPTIONS.map((seconds) => (
                <Chip
                  key={seconds}
                  selected={settings.roundSeconds === seconds}
                  onClick={() => update('roundSeconds', seconds)}
                  label={`${seconds} с`}
                />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle title="Играем до" />
            <div className="grid grid-cols-3 gap-2">
              {ALIAS_TARGET_SCORE_OPTIONS.map((score) => (
                <Chip
                  key={score}
                  selected={settings.targetScore === score}
                  onClick={() => update('targetScore', score)}
                  label={`${score} очков`}
                />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle title="Заветы" />
            <div className="grid grid-cols-3 gap-2">
              {ALIAS_TESTAMENTS.map((testament: AliasTestament) => (
                <Chip
                  key={testament}
                  selected={settings.testaments.includes(testament)}
                  onClick={() =>
                    update(
                      'testaments',
                      toggleInList(settings.testaments, testament, ALIAS_TESTAMENTS),
                    )
                  }
                  label={TESTAMENT_LABELS[testament]}
                />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <Toggle
              checked={settings.skipPenalty === 1}
              onChange={(checked) => update('skipPenalty', checked ? 1 : 0)}
              label="Штраф за пропуск"
              hint="Пропущенное слово отнимает очко"
            />
            <Toggle
              checked={settings.lastWordAfterBell}
              onChange={(checked) => update('lastWordAfterBell', checked)}
              label="Последнее слово"
              hint="После сигнала есть шанс на ещё одно"
            />
            <Toggle
              checked={settings.soundEnabled}
              onChange={(checked) => update('soundEnabled', checked)}
              label="Звук"
              hint="Сигналы таймера и ответов"
            />
          </section>
        </div>
      )}

      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-md flex-col gap-2 px-4 py-3">
          <p
            className={clsx(
              'text-center text-xs',
              thinDeck ? 'text-primary' : 'text-text-secondary',
            )}
            aria-live="polite"
          >
            {available === null ? (
              'Считаем колоду…'
            ) : thinDeck ? (
              <>
                В колоде всего {available} {pluralWords(available)} — добавьте категорию, иначе
                слова пойдут по кругу
              </>
            ) : (
              <>
                В колоде {available} {pluralWords(available)}
              </>
            )}
          </p>
          {error && <p className="text-center text-xs text-danger">{error}</p>}
          <Button onClick={onStart} disabled={starting || !namesFilled || available === 0}>
            {starting ? <Spinner /> : 'Начать игру'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">{title}</h2>
      {hint && <span className="text-xs text-text-muted">{hint}</span>}
    </div>
  );
}

function TeamRow({
  index,
  name,
  canRemove,
  onRename,
  onRemove,
}: {
  index: number;
  name: string;
  canRemove: boolean;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const color = ALIAS_TEAM_COLORS[index % ALIAS_TEAM_COLORS.length];

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2">
      <span
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <input
        ref={inputRef}
        value={name}
        onChange={(event) => onRename(event.target.value)}
        maxLength={24}
        aria-label={`Название команды ${index + 1}`}
        className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-text-primary outline-none placeholder:text-text-muted"
        placeholder={`Команда ${index + 1}`}
      />
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Убрать команду ${name}`}
          className="shrink-0 rounded-lg px-2 py-1 text-text-muted transition hover:text-danger"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function Chip({
  selected,
  onClick,
  label,
  hint,
  wide,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={clsx(
        'flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition',
        wide && 'col-span-2',
        selected
          ? 'border-primary bg-primary/10 text-text-primary'
          : 'border-border bg-surface text-text-secondary hover:border-text-muted',
      )}
    >
      <span className="text-sm font-semibold">{label}</span>
      {hint && <span className="text-[11px] leading-tight text-text-muted">{hint}</span>}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-3 py-3 text-left transition hover:border-text-muted"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-text-primary">{label}</span>
        <span className="block text-xs text-text-muted">{hint}</span>
      </span>
      <span
        className={clsx(
          'relative h-6 w-11 shrink-0 rounded-full transition',
          checked ? 'bg-primary' : 'bg-surface-hover',
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 h-5 w-5 rounded-full bg-bg transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  );
}
