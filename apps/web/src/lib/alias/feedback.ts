import { playSound } from '@/lib/sound';

/**
 * Обратная связь раунда Alias.
 *
 * Раньше здесь был собственный `AudioContext` со своими нотами — второй
 * звуковой движок в приложении. Он не знал ни о настройках профиля, ни о
 * свёрнутой вкладке, и выключение звука в настройках его не касалось.
 * Теперь это тонкая прослойка над общим движком, а своё у Alias осталось
 * только одно: галочка звука в самой партии.
 *
 * Она не то же самое, что настройка профиля. Телефон здесь передают из
 * рук в руки, и звук выключают, чтобы не мешать объясняющему, — вибрацию
 * при этом терять нельзя, поэтому выключенный звук партии даёт
 * `hapticsOnly`, а не тишину.
 */
export const aliasFeedback = {
  /**
   * Раньше здесь заводился звуковой контекст на первом касании. Теперь
   * это делает общий провайдер на любом нажатии в приложении, и
   * будить нечего — но вызов оставлен: он стоит в начале партии и
   * читается как «звук готов».
   */
  prime(): void {},
  guessed(soundEnabled: boolean): void {
    playSound('correct', { hapticsOnly: !soundEnabled });
  },
  skipped(soundEnabled: boolean): void {
    playSound('wrong', { hapticsOnly: !soundEnabled });
  },
  /** Последние секунды: тихий щелчок раз в секунду, чтобы держать напряжение
   * и не перекрикивать объясняющего. */
  tick(soundEnabled: boolean): void {
    if (soundEnabled) playSound('tick');
  },
  timeUp(soundEnabled: boolean): void {
    playSound('burnt', { hapticsOnly: !soundEnabled });
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
