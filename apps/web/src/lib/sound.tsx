'use client';

import { SOUND_SETTINGS_DEFAULT, type SoundName, type SoundSettings } from '@bible-arena/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useAuth } from './auth-context';

/**
 * Звук приложения.
 *
 * ## Почему звуки синтезируются, а не лежат файлами
 *
 * Готовые файлы означали бы: найти их, проверить лицензию каждого, хранить
 * источник, тащить мегабайты в приложение и следить, чтобы они не
 * протухли. Всё это ради десятка щелчков длиной в сотую долю секунды.
 *
 * Здесь они собираются из синусов прямо в браузере: ноль байт в сборке,
 * ноль вопросов к лицензиям, и звук можно поправить, изменив число, а не
 * перезаписав файл. Для коротких откликов интерфейса этого хватает с
 * запасом — а вот фоновая музыка так не делается, и она будет отдельно,
 * настоящими записями.
 *
 * ## Что здесь важно не сломать
 *
 * - **Контекст создаётся лениво и только после жеста игрока.** Браузер не
 *   даст звучать раньше, и это правильно: приложение не должно заговорить
 *   само.
 * - **Свёрнутая вкладка молчит.** Иначе приложение выглядит так, будто им
 *   кто-то пользуется без спроса.
 * - **Ошибка звука не ломает игру.** Всё, что здесь происходит, обёрнуто:
 *   не завёлся звук — партия всё равно идёт.
 */

/** Как собирается один звук: ноты и общая громкость. */
interface Recipe {
  /** Пары «частота, доля общей длительности» — по порядку. */
  notes: { hz: number; ms: number }[];
  /** Своя громкость: щелчок и победа не должны звучать одинаково. */
  gain: number;
  type: OscillatorType;
}

/**
 * Рецепты.
 *
 * Мажорные интервалы там, где событие хорошее, нисходящие — где плохое:
 * человек читает это без объяснений, потому что так устроена вся музыка,
 * которую он слышал.
 */
const RECIPES: Record<SoundName, Recipe> = {
  tap: { notes: [{ hz: 660, ms: 35 }], gain: 0.1, type: 'sine' },
  correct: {
    notes: [
      { hz: 659, ms: 90 },
      { hz: 988, ms: 130 },
    ],
    gain: 0.16,
    type: 'triangle',
  },
  wrong: {
    notes: [
      { hz: 233, ms: 110 },
      { hz: 175, ms: 160 },
    ],
    gain: 0.14,
    type: 'sine',
  },
  reward: {
    notes: [
      { hz: 523, ms: 70 },
      { hz: 659, ms: 70 },
      { hz: 784, ms: 70 },
      { hz: 1047, ms: 160 },
    ],
    gain: 0.15,
    type: 'triangle',
  },
  tick: { notes: [{ hz: 1200, ms: 25 }], gain: 0.07, type: 'sine' },
  start: {
    notes: [
      { hz: 440, ms: 80 },
      { hz: 660, ms: 80 },
      { hz: 880, ms: 180 },
    ],
    gain: 0.16,
    type: 'triangle',
  },
  opponent: { notes: [{ hz: 990, ms: 45 }], gain: 0.06, type: 'sine' },
  burnt: {
    notes: [
      { hz: 196, ms: 90 },
      { hz: 147, ms: 220 },
    ],
    gain: 0.13,
    type: 'sawtooth',
  },
  win: {
    notes: [
      { hz: 523, ms: 110 },
      { hz: 659, ms: 110 },
      { hz: 784, ms: 110 },
      { hz: 1047, ms: 280 },
    ],
    gain: 0.18,
    type: 'triangle',
  },
  lose: {
    notes: [
      { hz: 440, ms: 140 },
      { hz: 349, ms: 140 },
      { hz: 262, ms: 300 },
    ],
    gain: 0.15,
    type: 'sine',
  },
  draw: {
    notes: [
      { hz: 523, ms: 140 },
      { hz: 494, ms: 260 },
    ],
    gain: 0.14,
    type: 'sine',
  },
};

/** Вибро: короткая на отклик, двойная на плохое. */
const HAPTICS: Partial<Record<SoundName, number | number[]>> = {
  tap: 8,
  correct: 14,
  wrong: [18, 40, 18],
  burnt: [18, 40, 18],
  win: [20, 60, 20],
  lose: 40,
};

interface SoundApi {
  play: (name: SoundName) => void;
  settings: SoundSettings;
}

const SoundContext = createContext<SoundApi | null>(null);

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const contextRef = useRef<AudioContext | null>(null);

  const settings = useMemo<SoundSettings>(
    () => ({
      soundEnabled: user?.soundEnabled ?? SOUND_SETTINGS_DEFAULT.soundEnabled,
      musicEnabled: user?.musicEnabled ?? SOUND_SETTINGS_DEFAULT.musicEnabled,
      hapticsEnabled: user?.hapticsEnabled ?? SOUND_SETTINGS_DEFAULT.hapticsEnabled,
      soundVolume: user?.soundVolume ?? SOUND_SETTINGS_DEFAULT.soundVolume,
    }),
    [user],
  );

  // Контекст заводится на первом же касании и больше не пересоздаётся:
  // браузер не разрешает звук до жеста, а создавать его на каждый звук —
  // верный способ упереться в лимит контекстов.
  useEffect(() => {
    function unlock() {
      if (contextRef.current) {
        void contextRef.current.resume().catch(() => undefined);
        return;
      }
      try {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const created = new Ctor();
        contextRef.current = created;
        // Свежий контекст на части браузеров рождается приостановленным даже
        // внутри жеста — без этого первый звук просто теряется.
        void created.resume().catch(() => undefined);
      } catch {
        // Без звука приложение работает — молча живём дальше.
      }
    }
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []);

  // Свёрнутая вкладка молчит: звук из невидимого приложения ощущается как
  // чужое вмешательство, а не как отклик.
  useEffect(() => {
    function onVisibility() {
      const context = contextRef.current;
      if (!context) return;
      if (document.hidden) void context.suspend().catch(() => undefined);
      else void context.resume().catch(() => undefined);
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const play = useCallback(
    (name: SoundName) => {
      if (settings.hapticsEnabled) {
        const pattern = HAPTICS[name];
        if (pattern !== undefined && typeof navigator.vibrate === 'function') {
          try {
            navigator.vibrate(pattern);
          } catch {
            // Вибро — приятная мелочь, а не обязательство.
          }
        }
      }
      if (!settings.soundEnabled || settings.soundVolume <= 0) return;
      const context = contextRef.current;
      if (!context) return;
      // Молчим не по состоянию контекста, а по видимости вкладки: контекст
      // бывает приостановлен просто потому, что резюм ещё не доехал, и
      // раньше из-за этого пропадал первый же звук после нажатия.
      if (document.hidden) return;
      if (context.state === 'suspended') void context.resume().catch(() => undefined);

      const recipe = RECIPES[name];
      const master = (settings.soundVolume / 100) * recipe.gain;
      let at = context.currentTime;
      try {
        for (const note of recipe.notes) {
          const seconds = note.ms / 1000;
          const oscillator = context.createOscillator();
          const envelope = context.createGain();
          oscillator.type = recipe.type;
          oscillator.frequency.setValueAtTime(note.hz, at);
          // Мгновенная атака и мягкий спад: щелчок без «клика» на срезе.
          envelope.gain.setValueAtTime(0.0001, at);
          envelope.gain.exponentialRampToValueAtTime(master, at + 0.008);
          envelope.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
          oscillator.connect(envelope).connect(context.destination);
          oscillator.start(at);
          oscillator.stop(at + seconds + 0.02);
          at += seconds;
        }
      } catch {
        // Звук — не игра: сломался, и ладно.
      }
    },
    [settings],
  );

  const value = useMemo<SoundApi>(() => ({ play, settings }), [play, settings]);
  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

/**
 * Звук в любом месте приложения.
 *
 * Возвращает рабочий объект и вне провайдера — молчащий. Это намеренно:
 * забытый провайдер не должен ронять экран, а тишина заметна и без
 * исключения.
 */
export function useSound(): SoundApi {
  return (
    useContext(SoundContext) ?? {
      play: () => undefined,
      settings: SOUND_SETTINGS_DEFAULT,
    }
  );
}
