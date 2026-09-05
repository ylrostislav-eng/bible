'use client';

import { useEffect, useRef, useState } from 'react';
import { useSound } from './sound';

/**
 * Фоновая музыка: вечер у камина.
 *
 * ## Что здесь должно получиться
 *
 * Дом в лесу, огонь в очаге, кто-то негромко перебирает струны. Тепло и
 * уютно, слушать можно часами и не устать.
 *
 * ## Что было до этого и почему отброшено
 *
 * Первая версия была ля минор и одна тянущаяся подложка: четыре аккорда
 * по кругу, редкие ноты поверх. Технически исправно — и мимо: минор
 * звучал не уютно, а тревожно, а подложка без мелодии и без комнаты
 * вокруг оставалась гулом, а не музыкой. Отброшено целиком, и вот что
 * поменялось:
 *
 * - **Мажорные септаккорды вместо минора.** Fmaj7 — Em7 — Dm7 — Cmaj7:
 *   нисходящий круг, в котором нет ни печали, ни бодрости. Септима даёт
 *   ту самую мягкость, из-за которой такое слушают фоном.
 * - **Появилась мелодия.** Щипок с мгновенной атакой и долгим затуханием —
 *   так звучит струна, а не орган. Ноты идут не подряд: паузы важнее нот,
 *   потому что мелодия без пауз перестаёт быть фоном.
 * - **Появился камин.** Тихий гул и редкие потрескивания — это и делает
 *   картинку. Без них любой набор аккордов остаётся «музыкой из
 *   приложения»; с ними — комнатой, в которой играют.
 * - **Появилась комната.** Короткое эхо с затуханием: без него синтез
 *   звучит плоско и у самого уха, с ним — как будто в помещении.
 *
 * ## Почему всё это сочиняется, а не лежит записью
 *
 * Готовая петля — это файл: найти, проверить лицензию, записать
 * источник, привезти в сборку сотнями килобайт и потом слушать по кругу.
 * Любая петля выдаёт себя на втором проходе, а на десятом раздражает
 * ровно тех, кто заходит каждый день. Здесь буквального повтора нет:
 * аккорды идут кругом, а мелодия и треск огня каждый раз другие.
 *
 * Живую запись это не отменяет: появится — встанет ровно на это место.
 *
 * ## Что важно не сломать
 *
 * - **По умолчанию выключено.** Незапрошенная музыка в транспорте
 *   ощущается как поломка, а не как атмосфера.
 * - **Тише откликов.** Фон, который слышно наравне с «верно», мешает
 *   игре, ради которой включён.
 * - **Молчит там, где думают и читают.**
 * - **Свёрнутая вкладка молчит** — за это отвечает общий контекст.
 */

/** Секунд на долю. Медленно — около восьмидесяти ударов в минуту. */
const BEAT = 0.75;
/** Долей на аккорд. Восемь — успевает прозвучать фраза, а не обрывок. */
const BEATS_PER_CHORD = 8;
const CHORD_SECONDS = BEAT * BEATS_PER_CHORD;

/**
 * Круг аккордов: Fmaj7 — Em7 — Dm7 — Cmaj7.
 *
 * Нисходящий, весь в пределах до мажора, с септимой в каждом. Обычный до
 * банальности — и это верно: фон должен быть узнаваемым настолько, чтобы
 * его не замечали. Бас отдельно и ниже: он держит основание, а голоса
 * сверху не спорят с речью.
 */
const CHORDS: { bass: number; voices: number[] }[] = [
  { bass: 87.31, voices: [220.0, 261.63, 329.63] }, // Fmaj7: A3 C4 E4
  { bass: 82.41, voices: [196.0, 246.94, 293.66] }, // Em7:   G3 B3 D4
  { bass: 73.42, voices: [174.61, 220.0, 261.63] }, // Dm7:   F3 A3 C4
  { bass: 65.41, voices: [164.81, 196.0, 246.94] }, // Cmaj7: E3 G3 B3
];

/**
 * Ноты мелодии — до мажор без фа.
 *
 * Фа убрано намеренно: оно единственное, что режет слух над Cmaj7, и без
 * него любая нота ложится на любой из четырёх аккордов. Так мелодию можно
 * сочинять на ходу и не бояться фальши.
 */
const MELODY = [392.0, 440.0, 493.88, 523.25, 587.33, 659.25, 783.99, 880.0, 987.77, 1046.5];

/** Насколько вперёд планируем звук. */
const LOOKAHEAD_SECONDS = 2.5;

/**
 * ## Почему нет списка экранов, где музыка молчит
 *
 * Он был: чтение и проверка главы молчали всегда, партии — по настройке
 * «и во время партий». Отброшено по решению владельца, и решение
 * правильное: список экранов — это чужая догадка о том, что человеку
 * мешает, и он неизбежно ошибается в обе стороны. Кому-то музыка мешает
 * читать, кому-то с ней читается лучше.
 *
 * Вместо догадки — своя громкость у музыки и быстрый доступ к ней с
 * любого экрана (`components/music-widget.tsx`): мешает — убавил, не
 * уходя с того места, где помешало.
 *
 */

/**
 * Записанная тема, если она есть.
 *
 * Файл кладётся в `apps/web/public/music/` под этим именем. Нет файла —
 * играет синтез: приложение не должно молчать из-за того, что запись ещё
 * не приехала, и не должно ломаться, если её удалят.
 */
const TRACK_SRC = '/music/theme.mp3';

/**
 * Громкость записи.
 *
 * Отдельное число от синтеза: записанный трек сведён почти в полную
 * шкалу, а синтез собирается из тихих голосов, и один множитель на двоих
 * дал бы либо оглушительную запись, либо неслышный синтез.
 */
const TRACK_LEVEL = 0.3;

/**
 * Сколько отрезать от краёв при зацикливании.
 *
 * У экспорта из любого редактора и генератора края почти всегда с
 * тишиной: приехавший трек имел 0.51 с в начале и 0.32 с в конце, и на
 * стыке петли это давало паузу почти в секунду — слышную и оттого
 * особенно неприятную, потому что фон должен быть незаметным.
 *
 * Хвост режется с запасом (0.6 против измеренных 0.32): `timeupdate`
 * приходит примерно четырежды в секунду, и живая проверка показала
 * перескок на 0.15 с позже намеченного. Лишняя четверть секунды
 * приходится на затухание, а не на музыку.
 *
 * Режем в коде, а не в файле: перекодировать mp3 — значит потерять
 * качество ещё раз и держать в репозитории версию, отличную от той, что
 * прислал владелец. Числа с запасом: `timeupdate` приходит примерно
 * четырежды в секунду, и перескок случается чуть позже намеченного.
 *
 * При замене трека их стоит сверить — как мерить, написано в
 * `apps/web/public/music/README.md`.
 */
const TRACK_HEAD_SILENCE = 0.5;
const TRACK_TAIL_SILENCE = 0.6;

/** Где остановились. Переход в чтение и обратно не должен начинать заново. */
let trackPosition = 0;

export function AmbientMusic() {
  const { settings, audioContext, unlocked } = useSound();
  const on = settings.musicEnabled && settings.musicVolume > 0 && unlocked;

  // Есть ли записанная тема. `null` — ещё не ответила.
  const [hasTrack, setHasTrack] = useState<boolean | null>(null);
  useEffect(() => {
    if (!on || hasTrack !== null) return;
    // Спрашиваем только когда музыка действительно нужна: тянуть
    // мегабайты тому, кто музыку выключил, — расход чужого трафика.
    const probe = new Audio();
    probe.preload = 'metadata';
    const found = () => setHasTrack(true);
    const missing = () => setHasTrack(false);
    probe.addEventListener('loadedmetadata', found);
    probe.addEventListener('error', missing);
    probe.src = TRACK_SRC;
    return () => {
      probe.removeEventListener('loadedmetadata', found);
      probe.removeEventListener('error', missing);
      probe.src = '';
    };
  }, [on, hasTrack]);

  useTrack(on && hasTrack === true, settings.musicVolume);
  // Синтез играет, пока проба не сказала «есть запись», — а не пока она
  // не сказала «нет».
  //
  // Разница не теоретическая: живая проверка показала полную тишину.
  // Файл не отдавал ни `loadedmetadata`, ни `error` — просто висел, и
  // состояние навсегда осталось «ещё не ответила». Ждать ответ, чтобы
  // начать играть, значит поставить всю музыку в зависимость от одного
  // запроса, который может не завершиться никогда.
  useHearth(on && hasTrack === false, audioContext, settings.musicVolume);
  return null;
}

/**
 * Проигрывание записанной темы.
 *
 * Обычный `<audio>`, а не узел Web Audio: через Web Audio пришлось бы
 * тащить поток файла в граф ради одной только громкости, а платой за это
 * были бы требования к заголовкам и молчание при любой ошибке загрузки.
 * Вход и уход — плавные: музыка, обрывающаяся на полуслове, слышна
 * сильнее, чем звучавшая.
 *
 * Громкость нарочно не в зависимостях эффекта: с ней каждое движение
 * ползунка пересоздавало элемент, и трек заново вплывал четыре секунды.
 * Живая проверка это и показала — вместо ожидаемых 0.12 громкость была
 * 0.03, потому что вход ещё шёл. Ползунок меняет громкость на живом
 * элементе, ничего не пересоздавая.
 */
function useTrack(active: boolean, volume: number) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const targetRef = useRef(0);
  const fadingRef = useRef(false);

  // Цель пишется в эффекте, а не в теле: запись в ref во время отрисовки
  // ловит линтер и ловит правильно — при повторной отрисовке того же
  // состояния она выполнится лишний раз. Эффект объявлен раньше того,
  // который создаёт проигрывание, поэтому к моменту создания цель уже
  // на месте.
  //
  // Пока идёт вход или уход, громкостью распоряжается он: иначе ползунок
  // выставит её мгновенно и съест плавность.
  useEffect(() => {
    targetRef.current = (volume / 100) * TRACK_LEVEL;
    const audio = audioRef.current;
    if (audio && !fadingRef.current) audio.volume = targetRef.current;
  }, [volume]);

  useEffect(() => {
    if (!active) return;
    const audio = new Audio(TRACK_SRC);
    // Не `loop`: он возвращает ровно в нулевую секунду, вместе с тишиной
    // в начале файла. Прыгаем сами, минуя края.
    audio.loop = false;
    audio.currentTime = Math.max(trackPosition, TRACK_HEAD_SILENCE);
    audio.volume = 0;
    audioRef.current = audio;
    fadingRef.current = true;
    void audio.play().catch(() => undefined);

    function rewind() {
      const end = audio.duration - TRACK_TAIL_SILENCE;
      // Короткий файл резать нечем — пусть играет как есть.
      if (!Number.isFinite(end) || end <= TRACK_HEAD_SILENCE) return;
      if (audio.currentTime >= end) audio.currentTime = TRACK_HEAD_SILENCE;
    }
    audio.addEventListener('timeupdate', rewind);
    // Подстраховка: если перескок всё же опоздал и файл доиграл до конца,
    // молчания быть не должно.
    audio.addEventListener('ended', () => {
      audio.currentTime = TRACK_HEAD_SILENCE;
      void audio.play().catch(() => undefined);
    });

    let step = 0;
    const fadeIn = window.setInterval(() => {
      step += 1;
      // Цель берётся на каждом шаге: ползунок могли подвинуть прямо во
      // время входа, и доводить до устаревшего числа незачем.
      audio.volume = Math.min(targetRef.current, (targetRef.current * step) / 40);
      if (step >= 40) {
        window.clearInterval(fadeIn);
        fadingRef.current = false;
      }
    }, 100);

    return () => {
      window.clearInterval(fadeIn);
      audio.removeEventListener('timeupdate', rewind);
      trackPosition = audio.currentTime;
      audioRef.current = null;
      fadingRef.current = true;
      const from = audio.volume;
      let out = from;
      const fadeOut = window.setInterval(() => {
        out -= from / 15;
        if (out <= 0) {
          window.clearInterval(fadeOut);
          audio.pause();
          audio.src = '';
          return;
        }
        audio.volume = Math.max(0, out);
      }, 60);
    };
  }, [active]);
}

/** Синтезированный камин — пока записи нет. */
function useHearth(active: boolean, audioContext: () => AudioContext | null, musicVolume: number) {
  const masterRef = useRef<GainNode | null>(null);
  const levelRef = useRef(musicVolume);

  // Как и у записи: ползунок правит громкость на живом узле, а не
  // пересобирает весь камин заново. Запись в ref — в эффекте: в теле
  // отрисовки её справедливо ловит линтер.
  useEffect(() => {
    levelRef.current = musicVolume;
    const master = masterRef.current;
    if (!master) return;
    try {
      master.gain.setTargetAtTime(Math.max(0.0001, (musicVolume / 100) * 0.05), 0, 0.2);
    } catch {
      // Узел мог уже отключиться — музыка не игра.
    }
  }, [musicVolume]);

  useEffect(() => {
    if (!active) return;
    const context = audioContext();
    if (!context) return;
    // Локальная копия под замыкания: планировщик и обрыв зовутся позже, и
    // без неё сужение типа до них не доезжает.
    const ctx: AudioContext = context;

    let master: GainNode;
    let room: DelayNode;
    let noise: AudioBuffer;
    let bed: AudioBufferSourceNode;
    let breath: AudioBufferSourceNode;
    let bedGain: GainNode;
    try {
      master = ctx.createGain();
      master.connect(ctx.destination);
      masterRef.current = master;

      // Комната: короткое эхо с затуханием и срезом верха. Четыре узла — и
      // синтез перестаёт звучать у самого уха. Дешевле способа сделать
      // звук живым нет.
      room = ctx.createDelay(1);
      room.delayTime.value = 0.26;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.32;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 1800;
      room.connect(damp).connect(feedback).connect(room);
      const wet = ctx.createGain();
      wet.gain.value = 0.5;
      room.connect(wet).connect(master);

      // Шум готовим один раз буфером: считать его на каждый треск — это
      // сотни тысяч случайных чисел в секунду на пустом месте.
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noise.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < data.length; i += 1) {
        // Коричневый шум, а не белый: белый шипит как радио, коричневый
        // гудит как огонь.
        previous = (previous + Math.random() * 2 - 1) * 0.5;
        data[i] = previous;
      }

      // Ровный гул очага под всем остальным.
      //
      // Два слоя, а не один: срез на 380 Гц давал чистый низ без верха, и
      // в записи это читалось как гудение трубы, а не как огонь. У живого
      // пламени есть и придыхание — узкая полоса около трёх килогерц,
      // очень тихо. Без неё камин не узнаётся.
      bed = ctx.createBufferSource();
      bed.buffer = noise;
      bed.loop = true;
      const bedFilter = ctx.createBiquadFilter();
      bedFilter.type = 'lowpass';
      bedFilter.frequency.value = 700;
      bedGain = ctx.createGain();
      bedGain.gain.value = 0.5;
      bed.connect(bedFilter).connect(bedGain).connect(master);
      bed.start();

      const air = ctx.createBufferSource();
      air.buffer = noise;
      air.loop = true;
      const airFilter = ctx.createBiquadFilter();
      airFilter.type = 'bandpass';
      airFilter.frequency.value = 2800;
      airFilter.Q.value = 0.6;
      const airGain = ctx.createGain();
      airGain.gain.value = 0.05;
      air.connect(airFilter).connect(airGain).connect(master);
      air.start();
      breath = air;
    } catch {
      return;
    }

    // Громкость музыки — доля от общей: ползунок в настройках один, и две
    // ручки никто не крутит.
    //
    // Доля посчитана, а не подобрана на слух: аккорд с басом и щипком дают
    // до двух амплитуды до общего множителя, отклик «верно» — 0.16. 0.05
    // оставляет фон примерно вдвое тише отклика.
    const level = (levelRef.current / 100) * 0.05;
    const now = ctx.currentTime;
    master.gain.setValueAtTime(0.0001, now);
    // Вход через четыре секунды: музыка, включающаяся рывком, звучит как
    // случайно нажатая кнопка.
    master.gain.exponentialRampToValueAtTime(level, now + 4);

    let step = 0;
    let nextAt = now + 0.2;
    /** Где сейчас мелодия по ступеням. Ходит рядом, а не прыгает. */
    let melodyAt = 3;

    /** Долгий мягкий голос: аккорд и бас. */
    function drone(hz: number, at: number, gain: number, seconds: number) {
      const oscillator = ctx.createOscillator();
      const envelope = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(hz, at);
      envelope.gain.setValueAtTime(0.0001, at);
      envelope.gain.exponentialRampToValueAtTime(gain, at + 1.6);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
      oscillator.connect(envelope).connect(master);
      oscillator.start(at);
      oscillator.stop(at + seconds + 0.1);
    }

    /**
     * Щипок.
     *
     * Мгновенная атака и долгое затухание — так звучит струна. Второй
     * голос октавой выше и втрое тише даёт призвук, без которого нота
     * читается как гудок, а не как инструмент.
     */
    function pluck(hz: number, at: number, gain: number, seconds: number) {
      for (const [multiple, share, type] of [
        [1, 1, 'triangle'],
        [2, 0.28, 'sine'],
      ] as const) {
        const oscillator = ctx.createOscillator();
        const envelope = ctx.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(hz * multiple, at);
        envelope.gain.setValueAtTime(0.0001, at);
        envelope.gain.exponentialRampToValueAtTime(gain * share, at + 0.012);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
        oscillator.connect(envelope);
        envelope.connect(master);
        envelope.connect(room);
        oscillator.start(at);
        oscillator.stop(at + seconds + 0.05);
      }
    }

    /** Треск полена: короткий всплеск шума в средних частотах. */
    function crackle(at: number) {
      const source = ctx.createBufferSource();
      source.buffer = noise;
      // Со случайного места буфера: иначе два треска подряд слышны как
      // один и тот же щелчок.
      const offset = Math.random() * 1.5;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1200 + Math.random() * 2600;
      band.Q.value = 1.4;
      const envelope = ctx.createGain();
      const loudness = 0.3 + Math.random() * 0.6;
      const length = 0.012 + Math.random() * 0.045;
      envelope.gain.setValueAtTime(0.0001, at);
      envelope.gain.exponentialRampToValueAtTime(loudness, at + 0.003);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
      source.connect(band).connect(envelope);
      envelope.connect(master);
      envelope.connect(room);
      source.start(at, offset, length + 0.05);
      source.stop(at + length + 0.06);
    }

    /**
     * Фраза на один аккорд.
     *
     * Паузы тут важнее нот: мелодия, звучащая на каждую долю, перестаёт
     * быть фоном и начинает требовать внимания. Поэтому нота — меньше чем
     * в половине долей, а ход — на ступень-две в сторону, без прыжков.
     */
    function phrase(at: number) {
      for (let beat = 0; beat < BEATS_PER_CHORD; beat += 1) {
        if (Math.random() > 0.42) continue;
        melodyAt = Math.min(
          MELODY.length - 1,
          Math.max(0, melodyAt + (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.75 ? 1 : 2)),
        );
        // Немного вразнобой по времени и громкости: ровная сетка звучит
        // как автомат, а не как человек.
        const when = at + beat * BEAT + (Math.random() - 0.5) * 0.05;
        pluck(MELODY[melodyAt], when, 0.5 + Math.random() * 0.3, 1.6 + Math.random() * 1.4);
      }
    }

    // Планируем вперёд по часам звука, а не таймером на каждую ноту:
    // таймеры браузера плывут, расписание Web Audio — нет. Та же причина,
    // по которой часы партии считаются от серверного момента.
    function schedule() {
      try {
        while (nextAt < ctx.currentTime + LOOKAHEAD_SECONDS) {
          const chord = CHORDS[step % CHORDS.length];
          drone(chord.bass, nextAt, 0.42, CHORD_SECONDS + 0.5);
          for (const hz of chord.voices) drone(hz, nextAt, 0.2, CHORD_SECONDS + 0.5);
          phrase(nextAt);

          // Огонь трещит вразнобой, а не по сетке: равные промежутки
          // выдают синтез мгновенно.
          for (let t = 0; t < CHORD_SECONDS; t += 0.2) {
            if (Math.random() < 0.4) crackle(nextAt + t + Math.random() * 0.2);
          }
          // Очаг то разгорается, то оседает.
          bedGain.gain.linearRampToValueAtTime(0.35 + Math.random() * 0.35, nextAt + CHORD_SECONDS);

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
        // Уход тоже плавный: оборванная на полуслове музыка слышна сильнее,
        // чем звучавшая.
        master.gain.exponentialRampToValueAtTime(0.0001, at + 1.5);
      } catch {
        // Ничего не поделать — узлы всё равно отключатся ниже.
      }
      masterRef.current = null;
      window.setTimeout(() => {
        try {
          bed.stop();
          breath.stop();
          master.disconnect();
        } catch {
          // Уже остановлено.
        }
      }, 1800);
    };
  }, [active, audioContext]);
}
