"""Beat grid for a song whose tempo drifts (Suno: ~124.5 BPM at the start,
~128 by the last chorus) -> work/beats.npy, used by analyze.py.

1. dynamic-programming beat tracking (librosa) on a fused onset envelope
   (drums stem + mix, 2.9 ms hop), with a high tightness so it follows the
   pulse rather than syncopated hits;
2. the inter-beat intervals are smoothed (running median then mean over
   +-6 beats): the tempo moves slowly, the tracker's jitter does not;
3. the smoothed grid is re-anchored to the raw beats in overlapping windows
   (least-squares phase), so it never drifts off the tracked pulse.

Run:  uv run python beats.py
"""
import common
import numpy as np
import librosa
from scipy.ndimage import median_filter, uniform_filter1d

SR, HOP = 22050, 64


def onset_env():
    mix, _ = librosa.load(str(common.WORK / "mix.wav"), sr=SR)
    drums, _ = common.load_stem("drums", sr=SR)
    n = min(len(mix), len(drums))
    od = librosa.onset.onset_strength(y=drums[:n], sr=SR, hop_length=HOP, lag=1, max_size=1)
    om = librosa.onset.onset_strength(y=mix[:n], sr=SR, hop_length=HOP, lag=1, max_size=1)
    return od / (np.percentile(od, 99) + 1e-9) + om / (np.percentile(om, 99) + 1e-9)


def track(o):
    _, b = librosa.beat.beat_track(onset_envelope=o, sr=SR, hop_length=HOP, start_bpm=128,
                                   tightness=800, units="time", trim=False)
    return np.asarray(b)


def smooth(b, half=6):
    ibi = np.diff(b)
    s = uniform_filter1d(median_filter(ibi, 2 * half + 1, mode="nearest"), 2 * half + 1, mode="nearest")
    g = np.concatenate([[0.0], np.cumsum(s)])
    # piecewise phase: blend windowed least-squares offsets
    off = np.zeros(len(b))
    w = np.zeros(len(b))
    for c in range(0, len(b), 8):
        a, e = max(0, c - 16), min(len(b), c + 16)
        k = np.median(b[a:e] - g[a:e])
        tri = 1 - np.abs(np.arange(a, e) - c) / 16
        off[a:e] += k * tri
        w[a:e] += tri
    return g + off / np.maximum(w, 1e-9)


if __name__ == "__main__":
    o = onset_env()
    raw = track(o)
    b = smooth(raw)
    r = raw - b
    print(f"{len(b)} beats  {b[0]:.3f}..{b[-1]:.3f}  residual sd {r.std()*1000:.1f} ms  max {np.abs(r).max()*1000:.1f} ms")
    ibi = np.diff(b)
    for t0 in range(0, int(b[-1]), 20):
        m = (b[:-1] >= t0) & (b[:-1] < t0 + 20)
        if m.any():
            print(f"  {t0:4d}s  {60 / ibi[m].mean():7.2f} BPM")
    np.save(common.WORK / "beats.npy", b)
    np.save(common.WORK / "beats_raw.npy", raw)
