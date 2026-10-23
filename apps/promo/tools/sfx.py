"""The promo's sound effects, synthesised (no samples, no licences): public/sfx/*.wav.

Tonal ones are tuned to the track (G major): the pentatonic G A B D E. Everything is short, clean and
quiet enough to sit under the music; the composition sets the levels.

Run:  uv run --with numpy python tools/sfx.py
"""
import wave
from pathlib import Path

import numpy as np

SR = 48000
OUT = Path(__file__).resolve().parents[1] / "public" / "sfx"
RNG = np.random.default_rng(7)
# G major pentatonic, two octaves from G5
NOTES = [783.99, 880.0, 987.77, 1174.66, 1318.51, 1567.98, 1760.0, 1975.53, 2349.32, 2637.02]


def t(sec: float) -> np.ndarray:
    return np.arange(int(SR * sec)) / SR


def env(n: int, attack: float, decay: float) -> np.ndarray:
    x = np.arange(n) / SR
    a = np.clip(x / max(attack, 1e-4), 0, 1)
    return a * np.exp(-np.maximum(x - attack, 0) / decay)


def lowpass(x: np.ndarray, cut: float) -> np.ndarray:
    a = np.exp(-2 * np.pi * cut / SR)
    y = np.zeros_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def highpass(x: np.ndarray, cut: float) -> np.ndarray:
    return x - lowpass(x, cut)


def sweep_noise(sec: float, f0: float, f1: float, q: float = 0.35) -> np.ndarray:
    """Noise through a band that moves from f0 to f1 (a two-pole resonator, recomputed per sample)."""
    n = int(SR * sec)
    x = RNG.standard_normal(n)
    f = np.geomspace(f0, f1, n)
    y = np.zeros(n)
    y1 = y2 = 0.0
    for i in range(n):
        w = 2 * np.pi * f[i] / SR
        r = np.exp(-w * q)
        b1, b2 = 2 * r * np.cos(w), -r * r
        v = (1 - r) * x[i] + b1 * y1 + b2 * y2
        y2, y1 = y1, v
        y[i] = v
    return y / (np.abs(y).max() + 1e-9)


def room(x: np.ndarray, mix: float = 0.18, ms: tuple[int, ...] = (23, 37, 53, 71)) -> np.ndarray:
    """A small, bright room: a few feedback delays."""
    y = np.concatenate([x, np.zeros(int(SR * 0.4))])
    wet = np.zeros_like(y)
    for d in ms:
        k = int(SR * d / 1000)
        e = np.zeros_like(y)
        e[k:] = y[:-k] * 0.5
        for _ in range(3):
            e[k:] += e[:-k] * 0.35
        wet += e
    return y + mix * wet / len(ms)


def stereo(x: np.ndarray, pan: np.ndarray | float = 0.0) -> np.ndarray:
    p = np.broadcast_to(np.asarray(pan, dtype=float), x.shape)
    l, r = np.cos((p + 1) * np.pi / 4), np.sin((p + 1) * np.pi / 4)
    return np.stack([x * l, x * r], axis=1)


def write(name: str, x: np.ndarray, gain: float = 0.9) -> None:
    if x.ndim == 1:
        x = stereo(x)
    x = x / (np.abs(x).max() + 1e-9) * gain
    # 4 ms fades: no clicks at the edges
    f = min(len(x) // 2, int(SR * 0.004))
    ramp = np.linspace(0, 1, f)[:, None]
    x[:f] *= ramp
    x[-f:] *= ramp[::-1]
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())
    print(name, f"{len(x) / SR:.2f}s")


def pluck(freq: float, sec: float = 0.35, bright: float = 1.0) -> np.ndarray:
    x = t(sec)
    tone = np.sin(2 * np.pi * freq * x) + 0.35 * bright * np.sin(2 * np.pi * 2 * freq * x) + 0.12 * bright * np.sin(2 * np.pi * 3 * freq * x)
    return room(tone * env(len(x), 0.002, sec / 5), 0.12)


def main() -> None:
    # pop: a pitched blip with a fast drop, for words and chips
    for i, base in enumerate([520, 620, 740, 880]):
        x = t(0.18)
        f = base * (1 + 1.4 * np.exp(-x / 0.012))
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(x), 0.001, 0.045)
        click = highpass(RNG.standard_normal(len(x)), 3000) * env(len(x), 0.0005, 0.004) * 0.4
        write(f"pop-{i + 1}", room(s + click, 0.1), 0.8)
    # plinks: the events popping in, a note each (pentatonic, upwards)
    for i, f in enumerate(NOTES):
        write(f"plink-{i + 1}", pluck(f, 0.3, 0.6), 0.55)
    # typing: soft key taps, three variants
    for i in range(3):
        x = t(0.05)
        tap = lowpass(highpass(RNG.standard_normal(len(x)), 1800 + 300 * i), 6000) * env(len(x), 0.0005, 0.006)
        body = np.sin(2 * np.pi * (180 + 40 * i) * x) * env(len(x), 0.0005, 0.012) * 0.5
        write(f"type-{i + 1}", tap + body, 0.5)
    # click: a trackpad click, two transients
    x = t(0.09)
    c = np.zeros(len(x))
    for at, a in ((0.0, 1.0), (0.028, 0.55)):
        k = int(at * SR)
        n = len(x) - k
        c[k:] += highpass(RNG.standard_normal(n), 2500) * env(n, 0.0003, 0.003) * a
        c[k:] += np.sin(2 * np.pi * 1400 * x[:n]) * env(n, 0.0003, 0.006) * 0.4 * a
    write("click", c, 0.7)
    # whooshes: a band of noise sweeping, panned across
    for name, sec, f0, f1, pan in (("whoosh", 0.55, 300, 3200, (-0.7, 0.7)), ("whoosh-down", 0.6, 3000, 260, (0.6, -0.6)), ("whip", 0.22, 600, 6500, (-0.3, 0.5))):
        x = sweep_noise(sec, f0, f1)
        n = len(x)
        shape = np.sin(np.linspace(0, np.pi, n)) ** 1.6
        write(name, stereo(x * shape, np.linspace(*pan, n)), 0.7)
    # riser: noise and a rising tone into the drop (1.87 s, a bar)
    x = t(1.87)
    n = len(x)
    noise = sweep_noise(1.87, 400, 9000, 0.5)
    f = np.geomspace(196, 1568, n)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.35
    cres = (np.arange(n) / n) ** 2.2
    write("riser", (noise * 0.8 + tone) * cres, 0.75)
    # impact: a deep hit with a bright crack, for the drop and the end
    x = t(1.4)
    n = len(x)
    sub = np.sin(2 * np.pi * np.cumsum(55 * (1 + 1.2 * np.exp(-x / 0.03))) / SR) * env(n, 0.002, 0.35)
    crack = highpass(RNG.standard_normal(n), 1200) * env(n, 0.0005, 0.05) * 0.6
    air = lowpass(RNG.standard_normal(n), 3000) * env(n, 0.01, 0.4) * 0.15
    write("impact", room(sub + crack + air, 0.25), 0.95)
    # thud: an event landing
    x = t(0.35)
    n = len(x)
    s = np.sin(2 * np.pi * np.cumsum(110 * (1 + 0.8 * np.exp(-x / 0.015))) / SR) * env(n, 0.001, 0.07)
    tap = highpass(RNG.standard_normal(n), 2000) * env(n, 0.0005, 0.008) * 0.5
    write("thud", s + tap, 0.8)
    # chimes: Telegram-like notifications, three pitches (two-note bells)
    for i, (a, b) in enumerate(((1174.66, 1567.98), (1318.51, 1760.0), (1567.98, 2349.32))):
        x = t(0.9)
        n = len(x)
        bell = lambda f: (np.sin(2 * np.pi * f * x) + 0.25 * np.sin(2 * np.pi * 2.76 * f * x)) * env(n, 0.002, 0.22)
        second = np.zeros(n)
        k = int(0.09 * SR)
        second[k:] = bell(b)[: n - k]
        write(f"chime-{i + 1}", room(bell(a) + 0.9 * second, 0.22), 0.6)
    # ding: done, confirmed (a major third, bright)
    x = t(1.0)
    n = len(x)
    d = sum(np.sin(2 * np.pi * f * x) * w for f, w in ((1567.98, 1), (1975.53, 0.6), (3135.96, 0.2))) * env(n, 0.002, 0.3)
    write("ding", room(d, 0.25), 0.55)
    # sparkle: tiny high grains, the month filling in
    x = t(0.9)
    n = len(x)
    s = np.zeros(n)
    for _ in range(26):
        at = int(RNG.uniform(0, 0.6) * SR)
        f = RNG.choice(NOTES[4:]) * 2
        m = min(n - at, int(0.12 * SR))
        s[at : at + m] += np.sin(2 * np.pi * f * x[:m]) * env(m, 0.0008, 0.03) * RNG.uniform(0.3, 1)
    write("sparkle", room(s, 0.3), 0.45)
    # swish: a caption sliding in (short, soft)
    x = sweep_noise(0.3, 1500, 7000, 0.6)
    write("swish", x * np.sin(np.linspace(0, np.pi, len(x))) ** 2, 0.4)


if __name__ == "__main__":
    main()
