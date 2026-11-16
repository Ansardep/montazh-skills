# Синтез звуков для моушн-эффектов: python scripts/sfx.py  -> a/sfx/*.wav
import numpy as np, wave, os
SR = 44100
rng = np.random.default_rng(7)
os.makedirs('a/sfx', exist_ok=True)

def save(name, x):
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.9
    st = np.stack([x, x], 1)
    with wave.open(f'a/sfx/{name}.wav', 'w') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((st * 32767).astype(np.int16).tobytes())

def t(d): return np.arange(int(SR * d)) / SR
def env(n, a, r):  # attack/release in seconds
    e = np.ones(n); ai = int(a * SR); ri = int(r * SR)
    if ai: e[:ai] = np.linspace(0, 1, ai)
    if ri: e[-ri:] *= np.linspace(1, 0, ri) ** 2
    return e
def bandnoise(n, f0, f1, q=6):
    # noise through a sweeping resonant filter (simple state-variable)
    x = rng.standard_normal(n); y = np.zeros(n); low = band = 0.0
    fs = np.geomspace(f0, f1, n)
    for i in range(n):
        f = 2 * np.sin(np.pi * fs[i] / SR)
        low += f * band; high = x[i] - low - band / q; band += f * high; y[i] = band
    return y

# whoosh: sweeping filtered noise
n = int(SR * .55); save('whoosh', bandnoise(n, 300, 4000) * np.sin(np.linspace(0, np.pi, n)) ** 1.5)
# swoosh short (for small elements)
n = int(SR * .25); save('swish', bandnoise(n, 1500, 7000, 4) * np.sin(np.linspace(0, np.pi, n)) ** 2)
# whoosh down (exit)
n = int(SR * .45); save('whoosh_out', bandnoise(n, 3500, 250) * np.sin(np.linspace(0, np.pi, n)) ** 1.5)
# boom / impact: pitch-dropping sine + noise click
x = t(1.2); f = 120 * np.exp(-x * 6) + 38
boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 3.2)
boom += rng.standard_normal(len(x)) * np.exp(-x * 40) * .6
save('boom', boom)
# hit: tighter punch
x = t(.45); f = 180 * np.exp(-x * 14) + 55
save('hit', np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 9) + rng.standard_normal(len(x)) * np.exp(-x * 60) * .8)
# type tick
x = t(.04); save('tick', rng.standard_normal(len(x)) * np.exp(-x * 220) + np.sin(2 * np.pi * 2400 * x) * np.exp(-x * 300) * .5)
# click (UI)
x = t(.09); save('click', np.sin(2 * np.pi * 1800 * x) * np.exp(-x * 90) + rng.standard_normal(len(x)) * np.exp(-x * 400) * .4)
# pop (element appears)
x = t(.18); f = 900 * np.exp(-x * 25) + 300
save('pop', np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 22))
# glitch: chopped bitcrushed noise + square blips
x = t(.4); g = np.zeros(len(x))
for k in range(9):
    s = rng.integers(0, len(x) - 2000); L = rng.integers(400, 2500)
    fr = rng.choice([220, 440, 880, 1760, 3520])
    g[s:s + L] += np.sign(np.sin(2 * np.pi * fr * x[:L])) * .5 + rng.standard_normal(L) * .5
g = np.round(g * 6) / 6
save('glitch', g * env(len(x), .002, .05))
# riser: rising noise + tone
x = t(1.4); f = np.geomspace(200, 1800, len(x))
r = np.sin(2 * np.pi * np.cumsum(f) / SR) * .35 + bandnoise(len(x), 400, 6000, 3) * .8
save('riser', r * np.linspace(0, 1, len(x)) ** 2 * env(len(x), 0, .03))
# ding / sparkle
x = t(1.0); save('ding', (np.sin(2 * np.pi * 1320 * x) + .5 * np.sin(2 * np.pi * 1980 * x) + .3 * np.sin(2 * np.pi * 2640 * x)) * np.exp(-x * 5))
# scribble: drawing line (light noise hiss)
n = int(SR * .7); save('draw', bandnoise(n, 2500, 3500, 2) * env(n, .05, .2) * (0.7 + 0.3 * np.sin(np.linspace(0, 40, n))))
# beep (timer)
x = t(.12); save('beep', np.sin(2 * np.pi * 1000 * x) * env(len(x), .003, .03))
# flash: bright white-noise burst + sub
x = t(.6); save('flash', rng.standard_normal(len(x)) * np.exp(-x * 9) * .7 + np.sin(2 * np.pi * 50 * x) * np.exp(-x * 5))
# drone bed (dark ambience, 34 s)
x = t(34)
d = (np.sin(2 * np.pi * 55 * x) + .5 * np.sin(2 * np.pi * 82.4 * x + np.sin(x * .7)) + .25 * np.sin(2 * np.pi * 110.5 * x))
d *= .6 + .4 * np.sin(2 * np.pi * x / 8)
d = d * env(len(x), 1.5, 2.5)
save('drone', d)
print('ok')
