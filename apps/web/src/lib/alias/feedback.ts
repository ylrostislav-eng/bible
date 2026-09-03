/**
 * Звук и вибрация раунда.
 *
 * Тоны синтезируются, а не грузятся файлами: сигнал должен сработать
 * мгновенно и на выключенном интернете, а любой звуковой файл — это ещё
 * одна загрузка, которая на даче не приедет. Пары осцилляторов хватает,
 * чтобы «угадали», «пропуск» и «время вышло» отличались на слух даже в
 * шумной комнате.
 */

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    }
    // Браузеры держат контекст «приостановленным», пока страница не
    // получила касания. Первое же нажатие в игре его будит.
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

function tone(frequency: number, durationMs: number, gain = 0.08): void {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const oscillator = ctx.createOscillator();
    const volume = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    volume.gain.value = gain;
    // Гасим хвост: резко оборванная синусоида щёлкает.
    volume.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    oscillator.connect(volume);
    volume.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + durationMs / 1000);
  } catch {
    // Звук — приятная мелочь, а не условие игры.
  }
}

function vibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* пусто */
  }
}

export const aliasFeedback = {
  /** Разбудить звук первым касанием — до того, как он реально понадобится. */
  prime(): void {
    getContext();
  },
  guessed(soundEnabled: boolean): void {
    if (soundEnabled) tone(880, 90);
    vibrate(18);
  },
  skipped(soundEnabled: boolean): void {
    if (soundEnabled) tone(220, 120);
    vibrate(35);
  },
  /** Последние секунды: тихий щелчок раз в секунду, чтобы держать напряжение
   * и не перекрикивать объясняющего. */
  tick(soundEnabled: boolean): void {
    if (soundEnabled) tone(660, 45, 0.04);
  },
  timeUp(soundEnabled: boolean): void {
    if (soundEnabled) {
      tone(440, 220, 0.12);
      window.setTimeout(() => tone(330, 320, 0.12), 200);
    }
    vibrate([90, 60, 180]);
  },
};

/**
 * Не даёт экрану погаснуть, пока идёт партия. Телефон, уснувший на
 * тридцатой секунде раунда, — самая обидная поломка в этой игре, и
 * единственный способ её избежать.
 */
export function requestWakeLock(): () => void {
  let released = false;
  let sentinel: { release: () => Promise<void> } | null = null;

  const lock = navigator as unknown as {
    wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
  };
  if (!lock.wakeLock) return () => {};

  void lock.wakeLock
    .request('screen')
    .then((result) => {
      if (released) {
        void result.release();
        return;
      }
      sentinel = result;
    })
    .catch(() => {
      // Отказ (батарея на исходе, вкладка в фоне) не должен ничего ломать.
    });

  return () => {
    released = true;
    void sentinel?.release();
  };
}
