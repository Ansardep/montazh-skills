"""Синтез звуков и музыки-дрона для «Красного коллажа». Всё генерируется кодом — без чужих сэмплов.
   python scripts/make_sfx.py  ->  a/sfx/*.wav, a/music/drone.wav
"""
import os, wave
import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "a")
rng = np.random.default_rng(7)


def save(path, x, stereo=False):
    x = np.asarray(x, np.float32)
    x = x / (np.max(np.abs(x)) or 1) * 0.89
    if not stereo:
        x = np.stack([x, x], 1)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())


def t(d):
    return np.arange(int(d * SR)) / SR


def env(n, a, d, curve=4.0):
    """attack a сек, затухание по экспоненте до конца"""
    tt = np.arange(n) / SR
    e = np.minimum(tt / max(a, 1e-4), 1.0)
    return e * np.exp(-np.maximum(tt - a, 0) * curve / d)


def lp(x, cutoff):
    """простой однополюсный фильтр нижних частот (cutoff может быть массивом)"""
    c = np.broadcast_to(np.asarray(cutoff, float), x.shape)
    a = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x); s = 0.0
    for i in range(len(x)):
        s += a[i] * (x[i] - s); y[i] = s
    return y


def hp(x, cutoff):
    return x - lp(x, cutoff)


def noise(d):
    return rng.normal(0, 1, int(d * SR))


# --- удар «бум»: саб-бас с падением частоты + щелчок атаки
def boom(d=1.6):
    tt = t(d)
    f = 34 + 60 * np.exp(-tt * 9)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-tt * 2.6)
    click = hp(noise(d), 1500) * np.exp(-tt * 60) * 0.35
    rumble = lp(noise(d), 120) * np.exp(-tt * 3) * 2.2
    return np.tanh((body + click + rumble) * 1.6)


# --- жёсткий импакт: бум + металлический хвост
def impact(d=1.8):
    tt = t(d)
    x = boom(d) * 0.9
    metal = sum(np.sin(2 * np.pi * f * tt) * np.exp(-tt * k) for f, k in [(212, 4), (377, 5), (531, 6), (790, 7)]) * 0.12
    crack = hp(noise(d), 2500) * np.exp(-tt * 25) * 0.5
    return x + metal + crack


# --- вжух: шум со сдвигом фильтра, нарастание и спад
def whoosh(d=0.7, up=True):
    n = int(d * SR); tt = t(d)
    shape = np.sin(np.pi * np.clip(tt / d, 0, 1)) ** 2
    cut = 300 + 5500 * (tt / d if up else 1 - tt / d)
    x = lp(noise(d), cut) * shape
    return x


def swish(d=0.35):  # короткий быстрый вжух для мелких влётов
    tt = t(d)
    shape = np.sin(np.pi * tt / d) ** 3
    return hp(lp(noise(d), 4000 + 3000 * tt / d), 900) * shape


# --- шелест бумаги: хрусткие щелчки в полосе 2–7 кГц
def paper(d=0.6):
    n = int(d * SR)
    x = np.zeros(n)
    for _ in range(int(55 * d)):
        p = rng.integers(0, n - 800); L = rng.integers(80, 700)
        x[p:p + L] += rng.normal(0, 1, L) * np.exp(-np.arange(L) / (L / 4)) * rng.uniform(0.3, 1)
    x = hp(x, 1800)
    return x * np.sin(np.pi * np.arange(n) / n) ** 0.5


# --- тик часов
def tick(d=0.12):
    tt = t(d)
    return (np.sin(2 * np.pi * 2900 * tt) + 0.6 * np.sin(2 * np.pi * 4700 * tt)) * np.exp(-tt * 90) + hp(noise(d), 3000) * np.exp(-tt * 200) * 0.4


# --- звон монеты
def coin(d=0.9):
    tt = t(d)
    parts = [(2750, 6), (4130, 8), (5520, 9), (6900, 11), (8350, 14)]
    x = sum(np.sin(2 * np.pi * f * tt + rng.uniform(0, 6)) * np.exp(-tt * k) * (1 / (i + 1)) for i, (f, k) in enumerate(parts))
    return x + hp(noise(d), 4000) * np.exp(-tt * 80) * 0.5


# --- глитч: заикающиеся кусочки шума и писка
def glitch(d=0.5):
    n = int(d * SR); x = np.zeros(n); tt = t(d)
    pos = 0
    while pos < n:
        L = int(rng.uniform(0.015, 0.06) * SR)
        kind = rng.integers(0, 3)
        seg = np.arange(min(L, n - pos)) / SR
        if kind == 0:
            s = np.sign(np.sin(2 * np.pi * rng.uniform(300, 2500) * seg))
        elif kind == 1:
            s = rng.normal(0, 1, len(seg))
        else:
            s = np.zeros(len(seg))
        x[pos:pos + len(seg)] = s * rng.uniform(0.3, 1)
        pos += L
    x = np.round(x * 6) / 6  # «битая» разрядность
    return x * 0.7


# --- инверт-вспышка: короткий яркий «пшш» + щелчок
def flash(d=0.45):
    tt = t(d)
    return hp(noise(d), 3000) * np.exp(-tt * 14) + np.sin(2 * np.pi * 90 * tt) * np.exp(-tt * 20) * 0.8


# --- райзер перед кульминацией
def riser(d=2.0):
    tt = t(d)
    f = 120 * (2 ** (tt / d * 4))
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.35
    nz = lp(noise(d), 300 + 8000 * (tt / d) ** 2)
    return (tone + nz) * (tt / d) ** 2


# --- щелчок печати буквы / текста
def type_(d=0.08):
    tt = t(d)
    return hp(noise(d), 2000) * np.exp(-tt * 140) + np.sin(2 * np.pi * 1800 * tt) * np.exp(-tt * 120) * 0.3


# --- провал в тоннель: низкий свип вниз + всасывание
def suck(d=1.2):
    tt = t(d)
    f = 220 * np.exp(-tt * 2.5) + 30
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * (1 - tt / d)
    nz = lp(noise(d), 4000 * (1 - tt / d) + 100) * (tt / d) ** 0.5 * (1 - tt / d) * 2
    return tone + nz


# --- сердцебиение
def heart(d=1.0):
    tt = t(d)
    def thump(t0, a):
        u = np.maximum(tt - t0, 0)
        return np.sin(2 * np.pi * (45 + 30 * np.exp(-u * 30)) * u) * np.exp(-u * 18) * (tt >= t0) * a
    return thump(0, 1) + thump(0.28, 0.7)


# --- музыка-дрон: тёмный эмбиент 70 с (зацикливается), ля-минор
def drone(d=70.0):
    tt = t(d)
    notes = [55.0, 82.41, 110.0, 130.81]  # A1 E2 A2 C3
    x = np.zeros_like(tt)
    for i, f in enumerate(notes):
        lfo = 0.6 + 0.4 * np.sin(2 * np.pi * (0.05 + i * 0.013) * tt + i)
        for det in (-0.12, 0.0, 0.13):
            ph = 2 * np.pi * (f + det) * tt
            # мягкая «пила» из 6 гармоник
            saw = sum(np.sin(ph * k) / k for k in range(1, 7))
            x += saw * lfo * (0.5 if i else 0.9) / 3
    # медленная фильтровка
    x = lp(x, 500 + 300 * np.sin(2 * np.pi * 0.03 * tt))
    air = lp(hp(noise(d), 2000), 6000) * 0.03 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.07 * tt))
    pulse = np.sin(2 * np.pi * 41.2 * tt) * (0.5 + 0.5 * np.sin(2 * np.pi * 1.2 * tt)) ** 8 * 0.5  # глухая пульсация 72 bpm
    x = x + air + pulse
    fade = np.minimum(1, np.minimum(tt / 1.5, (d - tt) / 1.5))
    left = x * fade
    right = np.roll(x, int(0.011 * SR)) * fade
    return np.stack([left, right], 1)


if __name__ == "__main__":
    S = os.path.join(OUT, "sfx")
    for name, fn in {"boom": boom, "impact": impact, "whoosh": whoosh, "swish": swish, "paper": paper,
                     "tick": tick, "coin": coin, "glitch": glitch, "flash": flash, "riser": riser,
                     "type": type_, "suck": suck, "heart": heart}.items():
        save(os.path.join(S, name + ".wav"), fn()); print("sfx", name)
    wav = os.path.join(OUT, "music", "drone.wav")
    save(wav, drone(), stereo=True)
    import subprocess
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", wav, "-b:a", "160k", wav[:-4] + ".mp3"], check=True)
    os.remove(wav); print("music drone.mp3")
