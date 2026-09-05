"""Средний спектр записи.

Первая версия считала ДПФ по каждому 16-му отсчёту ради скорости — и это
был не замер, а артефакт: прореживание складывает всё выше 1.4 кГц обратно
в слышимую полосу, и «75% энергии на верхах» получалось из воздуха.
Полное БПФ по всем отсчётам показывает совсем другую картину.
"""
import wave, struct, sys
import numpy as np

w = wave.open(sys.argv[1] if len(sys.argv) > 1 else 'hearth.wav')
n, rate = w.getnframes(), w.getframerate()
s = np.array(struct.unpack('<%dh' % n, w.readframes(n)), dtype=np.float64) / 32768

SIZE = 8192
window = np.hanning(SIZE)
freqs = np.fft.rfftfreq(SIZE, 1 / rate)
edges = [(0, 200, 'низ (бас, аккорды)'), (200, 1000, 'середина (голоса, щипки)'),
         (1000, 5000, 'верх (треск, призвуки)'), (5000, rate / 2, 'воздух')]
total = np.zeros(len(edges))
steps = 40
for i in range(steps):
    start = int(i * (n - SIZE) / steps)
    spectrum = np.abs(np.fft.rfft(s[start:start + SIZE] * window)) ** 2
    for j, (lo, hi, _) in enumerate(edges):
        total[j] += spectrum[(freqs >= lo) & (freqs < hi)].sum()
share = 100 * total / total.sum()
for (lo, hi, name), v in zip(edges, share):
    print(f'  {name:28} {v:5.1f}%')

win = rate // 10
env = np.array([np.sqrt((s[i:i + win] ** 2).mean()) for i in range(0, n - win, win)])
avg = env.mean()
print(f'громкость: пик {np.abs(s).max():.2f}, RMS {avg:.3f}')
print(f'всплесков (щипки, треск): {(env > avg * 1.6).sum()} из {len(env)}, '
      f'тихих провалов: {(env < avg * 0.5).sum()}')
