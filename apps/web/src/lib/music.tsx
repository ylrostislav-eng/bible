'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useSound } from './sound';

/**
 * Фоновая музыка.
 *
 * ## Почему она сочиняется, а не лежит записью
 *
 * Сначала было решено обратное: короткие отклики синтезировать, а музыку
 * взять настоящими записями — генеративной подложкой её не сделать.
 * Это отброшено, и вот почему.
 *
 * Готовая петля — это файл. Файл надо найти, проверить лицензию,
 * записать источник, привезти в сборку сотнями килобайт и потом слушать
 * его по кругу: любая петля выдаёт себя на втором проходе, а на десятом
 * начинает раздражать ровно тех, кто играет каждый день. Здесь музыка
 * собирается по ходу дела и потому не повторяется буквально: аккорды
 * идут по кругу, а редкие ноты поверх — каждый раз другие.
 *
 * Это не отменяет живую запись: если она когда-нибудь появится, она
 * встанет ровно на это место. Но приложение не должно молчать до тех
 * пор.
 *
 * ## Что здесь важно не сломать
 *
 * - **По умолчанию выключено.** Незапрошенная музыка в транспорте или на
 *   работе ощущается как поломка, а не как атмосфера.
 * - **Тише откликов.** Музыка — фон; если её слышно наравне с «верно»,
 *   она мешает игре, ради которой включена.
 * - **Молчит там, где думают и читают.** В партии, в чтении главы и в
 *   «Слове дня» музыки нет: она отвлекает ровно тогда, когда нужна
 *   тишина.
 * - **Свёрнутая вкладка молчит** — за это отвечает общий контекст, он
 *   приостанавливается целиком.
 */

/** Секунд на аккорд. Медленно: быстрее — уже не фон, а мелодия. */
const CHORD_SECONDS = 9;

/**
 * Круг аккордов — ля минор, самые обычные четыре.
 *
 * Взяты низкие голоса без терции сверху: так подложка не спорит с речью
 * и не тянет на себя внимание. Экзотика тут была бы ошибкой — фон должен
 * быть узнаваемым настолько, чтобы его не замечали.
 */
const CHORDS: number[][] = [
  [110.0, 130.81, 164.81, 220.0], // Am
  [87.31, 110.0, 130.81, 174.61], // F
  [130.81, 164.81, 196.0, 261.63], // C
  [98.0, 123.47, 146.83, 196.0], // G
];

/** Редкие ноты поверх — пентатоника, в ней не бывает неверной ноты. */
const BELLS = [440.0, 523.25, 587.33, 659.25, 783.99];

/** Насколько вперёд планируем звук. */
const LOOKAHEAD_SECONDS = 2.5;

/**
 * Экраны, где музыка молчит.
 *
 * Список — по началу адреса, а не точным совпадением: у партий бывают
 * вложенные адреса, и точный список пришлось бы дополнять при каждом
 * новом экране режима.
 */
const SILENT_PREFIXES = [
  '/play/solo',
  '/play/duel',
  '/play/room',
  '/play/alias',
  '/learn',
  '/daily',
  '/hot-cold',
];

function musicAllowed(pathname: string | null): boolean {
  if (!pathname) return false;
  return !SILENT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function AmbientMusic() {
  const { settings, audioContext, unlocked } = useSound();
  const pathname = usePathname();
  const allowed = musicAllowed(pathname);

  useEffect(() => {
    if (!settings.musicEnabled || settings.soundVolume <= 0 || !allowed || !unlocked) return;
    const context = audioContext();
    if (!context) return;
    // Локальная копия под замыкания: планировщик и обрыв зовутся позже,
    // и без неё сужение типа до них не доезжает.
    const ctx: AudioContext = context;

    let master: GainNode;
    let filter: BiquadFilterNode;
    try {
      master = ctx.createGain();
      filter = ctx.createBiquadFilter();
      // Срез сверху: без него синусы звучат стеклянно и лезут вперёд.
      filter.type = 'lowpass';
      filter.frequency.value = 1400;
      filter.Q.value = 0.7;
      master.connect(filter).connect(ctx.destination);
    } catch {
      return;
    }

    // Громкость музыки — доля от общей: ползунок в настройках один, и
    // две ручки никто не крутит.
    //
    // Доля посчитана, а не подобрана на слух: четыре голоса аккорда дают
    // до 2.9 амплитуды до общего множителя, отклик «верно» — 0.16. При
    // 0.085 подложка выходила громче отклика по пику, а тянущийся аккорд
    // слышен ещё сильнее короткого сигнала. 0.045 даёт около половины от
    // отклика — фон остаётся фоном.
    const level = (settings.soundVolume / 100) * 0.045;
    const now = ctx.currentTime;
    master.gain.setValueAtTime(0.0001, now);
    // Вход через четыре секунды: музыка, включающаяся рывком, звучит как
    // случайно нажатая кнопка.
    master.gain.exponentialRampToValueAtTime(level, now + 4);

    let step = 0;
    let nextAt = now + 0.2;

    function voice(hz: number, at: number) {
      for (const [type, detune] of [
        ['sine', 0],
        ['triangle', 4],
      ] as const) {
        const oscillator = ctx.createOscillator();
        const envelope = ctx.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(hz, at);
        oscillator.detune.setValueAtTime(detune, at);
        // Длинный вход и длинный выход внахлёст со следующим аккордом:
        // так смена не слышна как смена.
        envelope.gain.setValueAtTime(0.0001, at);
        envelope.gain.exponentialRampToValueAtTime(type === 'sine' ? 0.5 : 0.22, at + 3);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + CHORD_SECONDS + 0.6);
        oscillator.connect(envelope).connect(master);
        oscillator.start(at);
        oscillator.stop(at + CHORD_SECONDS + 1);
      }
    }

    function bell(at: number) {
      const oscillator = ctx.createOscillator();
      const envelope = ctx.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(BELLS[Math.floor(Math.random() * BELLS.length)], at);
      envelope.gain.setValueAtTime(0.0001, at);
      envelope.gain.exponentialRampToValueAtTime(0.28, at + 0.05);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + 2.6);
      oscillator.connect(envelope).connect(master);
      oscillator.start(at);
      oscillator.stop(at + 2.8);
    }

    // Планируем вперёд, а не по таймеру на каждую ноту: таймеры браузера
    // плывут, а расписание Web Audio — нет. Это ровно та же причина, по
    // которой часы партии считаются от серверного момента, а не тиками.
    function schedule() {
      try {
        while (nextAt < ctx.currentTime + LOOKAHEAD_SECONDS) {
          for (const hz of CHORDS[step % CHORDS.length]) voice(hz, nextAt);
          // Не на каждый аккорд: предсказуемая нота через равные
          // промежутки превращает фон в метроном.
          if (Math.random() < 0.55) bell(nextAt + 3 + Math.random() * 3);
          nextAt += CHORD_SECONDS;
          step += 1;
        }
      } catch {
        // Музыка — не игра: сломалась, и ладно.
      }
    }

    schedule();
    const timer = window.setInterval(schedule, 700);

    return () => {
      window.clearInterval(timer);
      try {
        const at = ctx.currentTime;
        master.gain.cancelScheduledValues(at);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), at);
        // Уход тоже плавный: оборванная на полуслове музыка слышна
        // сильнее, чем звучавшая.
        master.gain.exponentialRampToValueAtTime(0.0001, at + 1.5);
      } catch {
        // Ничего не поделать — узлы всё равно отключатся ниже.
      }
      window.setTimeout(() => {
        try {
          master.disconnect();
          filter.disconnect();
        } catch {
          // Уже отключены.
        }
      }, 1800);
    };
  }, [settings.musicEnabled, settings.soundVolume, allowed, unlocked, audioContext]);

  return null;
}
