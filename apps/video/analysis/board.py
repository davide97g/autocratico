"""The Board promo's music (song/board.mp3) and its analysis (data/board/audio.json).

The track is "Cinematic Inspiring Piano" by Alex_MakeMusic on Pixabay (Pixabay Content License: free
for commercial use, no attribution; not to be redistributed on its own, so the mp3 is not in the repo):
https://pixabay.com/music/main-title-cinematic-inspiring-piano-311879/

The edit keeps 34 s: the soft build from 72.67 s (the bass enters 10 s in), then a cut at 92.68 s to
108.68 s, the same place one 16-second phrase later (its chroma repeats, so the cut is seamless; the full
band carries on from 20 s), up to the downbeat at 120.69 s that closes the climax (32.0 s into the edit),
which rings out to 34 s.

Run:  uv run python board.py [path/to/downloaded.mp3]
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
URL = "https://cdn.pixabay.com/download/audio/2025/03/10/audio_3fe9a00b73.mp3?filename=alex_makemusic-cinematic-inspiring-piano-311879.mp3"
SONG = APP / "song" / "board.mp3"
OUT = APP / "data" / "board" / "audio.json"
FPS = 100
# Bars of the edit (s): every 2.002 s from 0; the lift and the final hit are named sections.
SECTIONS = [("build", 0.0, 10.0), ("lift", 10.0, 20.0), ("full", 20.0, 32.02), ("end", 32.02, 34.0)]


def edit(src: Path) -> None:
    SONG.parent.mkdir(parents=True, exist_ok=True)
    f = (
        "[0:a]atrim=72.67:92.70,asetpts=PTS-STARTPTS[a];[0:a]atrim=108.66:122.72,asetpts=PTS-STARTPTS[b];"
        "[a][b]acrossfade=d=0.04:c1=tri:c2=tri,afade=t=in:st=0:d=0.4,afade=t=out:st=32.1:d=1.9,atrim=0:34"
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
    o = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    _, beats = librosa.beat.beat_track(onset_envelope=o, sr=sr, hop_length=hop, start_bpm=120, tightness=800, units="time", trim=False)
    beats = np.asarray(beats)
    # The grid is steady (a produced track): fit one period and phase to the tracked beats.
    k = np.arange(len(beats))
    period, phase = np.polyfit(k, beats, 1)
    # Bar 0 starts at 0 (the edit starts on a downbeat): shift the phase to the nearest multiple.
    phase = phase - round(phase / period) * period
    grid = [round(float(phase + i * period), 3) for i in range(int((dur - phase) / period) + 1) if phase + i * period >= -1e-3]
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
        "notes": "Board promo: Alex_MakeMusic, Cinematic Inspiring Piano (Pixabay), edit 72.67-92.68 + 108.68-122.7 s.",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":")))
    (OUT.parent / "lyrics.json").write_text(json.dumps({"lines": []}))
    print(f"{OUT}: {data['bpm']} BPM, {len(grid)} beats, {len(downbeats)} bars, {len(data['onsets']['kick'])} low hits")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        edit(Path(sys.argv[1]))
    elif not SONG.exists():
        tmp = APP / "song" / "board-source.mp3"
        req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://pixabay.com/"})
        tmp.write_bytes(urllib.request.urlopen(req).read())
        edit(tmp)
        tmp.unlink()
    analyze()
