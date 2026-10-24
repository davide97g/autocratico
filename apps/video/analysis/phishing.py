"""The phishing promo's music (song/phishing.mp3) and its analysis (data/phishing/audio.json).

The track is "Dance Upbeat Pop" by Kulakovka on Pixabay (Pixabay Content License: free for commercial
use, no attribution; not to be redistributed on its own, so the mp3 is not in the repo):
https://pixabay.com/music/dance-dance-upbeat-pop-611603/

120 BPM, a bar every 2.000 s; the first chorus drops at 16.045 s. The edit keeps 24 s: the last two bars
of the build (the riser), the drop (4.0 s into the edit), seven bars of chorus, then a cut to the same
place of the last chorus (the eighth bar of an eight-bar phrase: 30.045 -> 110.045), and the hit that
opens the outro (112.045 s, 20.0 s into the edit), which rings out to 24 s.

Run:  uv run python phishing.py [path/to/downloaded.mp3]
      (without a path it downloads the track first)
"""
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

import librosa
import numpy as np

APP = Path(__file__).resolve().parents[1]
URL = "https://cdn.pixabay.com/download/audio/2026/09/28/audio_ab051cb923.mp3?filename=kulakovka-dance-upbeat-pop-611603.mp3"
SONG = APP / "song" / "phishing.mp3"
OUT = APP / "data" / "phishing" / "audio.json"
FPS = 100
# The source's bar grid (s): bar i of the first chorus starts at DROP0 + i * BAR.
DROP0, BAR = 16.045, 2.0
A0, A1, B0 = DROP0 - 2 * BAR, DROP0 + 7 * BAR, DROP0 + 47 * BAR
DROP, HIT, LENGTH = 2 * BAR, (A1 - A0) + BAR, 24.0
SECTIONS = [("build", 0.0, DROP), ("chorus", DROP, HIT), ("end", HIT, LENGTH)]


def edit(src: Path) -> None:
    SONG.parent.mkdir(parents=True, exist_ok=True)
    f = (
        f"[0:a]atrim={A0:.3f}:{A1 + 0.02:.3f},asetpts=PTS-STARTPTS[a];[0:a]atrim={B0 - 0.02:.3f}:{B0 + LENGTH:.3f},asetpts=PTS-STARTPTS[b];"
        f"[a][b]acrossfade=d=0.04:c1=tri:c2=tri,afade=t=in:st=0:d=0.05,afade=t=out:st={HIT + 1.5:.3f}:d={LENGTH - HIT - 1.5:.3f},atrim=0:{LENGTH}"
    )
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-filter_complex", f, "-ar", "44100", "-b:a", "256k", str(SONG)], check=True)


def envelope(x: np.ndarray, n: int) -> list[float]:
    x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x)
    x = x / (np.percentile(x, 99) + 1e-9)
    return [round(float(v), 4) for v in np.clip(x, 0, 1)]


def analyze() -> None:
    y, sr = librosa.load(str(SONG), sr=22050, mono=True)
    dur = len(y) / sr
    hop = 256
    # A produced track at a steady 120 BPM, cut on downbeats: the grid is known, not tracked.
    period = BAR / 4
    grid = [round(i * period, 3) for i in range(int(dur / period) + 1)]
    downbeats = grid[::4]

    n = int(dur * FPS)
    S = np.abs(librosa.stft(y, hop_length=hop))
    f = librosa.fft_frequencies(sr=sr)
    band = lambda lo, hi: S[(f >= lo) & (f < hi)].mean(0)
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    low, mid, high = band(20, 200), band(200, 2000), band(2000, 11000)

    def peaks(env: np.ndarray, thr: float) -> list[list[float]]:
        env = env / (np.percentile(env, 99) + 1e-9)
        idx = librosa.util.peak_pick(env, pre_max=6, post_max=6, pre_avg=20, post_avg=20, delta=thr, wait=20)
        t = librosa.frames_to_time(idx, sr=sr, hop_length=hop)
        return [[round(float(a), 3), round(float(min(1, env[i])), 3)] for a, i in zip(t, idx)]

    lo_on = librosa.onset.onset_strength(S=librosa.amplitude_to_db(S[(f >= 20) & (f < 200)]), sr=sr, hop_length=hop)
    hi_on = librosa.onset.onset_strength(S=librosa.amplitude_to_db(S[(f >= 2000)]), sr=sr, hop_length=hop)
    data = {
        "duration": round(dur, 3),
        "bpm": round(60 / period, 3),
        "beat_period": round(float(period), 5),
        "time_signature": 4,
        "beats": grid,
        "downbeats": downbeats,
        "sections": [{"name": s, "start": a, "end": b} for s, a, b in SECTIONS],
        "fps": FPS,
        "rms": envelope(rms, n),
        "low": envelope(low, n),
        "mid": envelope(mid, n),
        "high": envelope(high, n),
        "other": envelope(mid, n),
        "onsets": {"kick": peaks(lo_on, 0.25), "hat": peaks(hi_on, 0.3), "snare": [], "vocal": []},
        "notes": f"Phishing promo: Kulakovka, Dance Upbeat Pop (Pixabay), edit {A0:.2f}-{A1:.2f} + {B0:.2f}- s.",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":")))
    (OUT.parent / "lyrics.json").write_text(json.dumps({"lines": []}))
    print(f"{OUT}: {data['bpm']} BPM, {len(grid)} beats, {len(downbeats)} bars, {len(data['onsets']['kick'])} low hits")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        edit(Path(sys.argv[1]))
    elif not SONG.exists():
        tmp = APP / "song" / "phishing-source.mp3"
        req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://pixabay.com/"})
        tmp.write_bytes(urllib.request.urlopen(req).read())
        edit(tmp)
        tmp.unlink()
    analyze()
