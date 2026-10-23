"""The Agenda promo's music (song/agenda.mp3) and its analysis (data/agenda/audio.json).

The track is "Upbeat Uplifting Pop" by PaulYudin on Pixabay (Pixabay Content License: free for
commercial use, no attribution; not to be redistributed on its own, so the mp3 is not in the repo):
https://pixabay.com/music/pop-upbeat-uplifting-pop-153875/

128.6 BPM, a bar every 1.8667 s from 0.16 s. The edit keeps 30 s: two bars of the groove before the
first chorus (bars 10-11), the drop at bar 12 (3.73 s into the edit), ten bars of chorus, then a cut to
the same place of the last chorus (bar 22 -> bar 74: both are the third bar of a four-bar phrase), its
last two bars, and the hit that opens the outro (bar 76, 26.13 s into the edit), which rings out to 30 s.

Run:  uv run python agenda.py [path/to/downloaded.mp3]
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
URL = "https://cdn.pixabay.com/download/audio/2023/06/15/audio_6d84125fa7.mp3?filename=paulyudin-upbeat-uplifting-pop-153875.mp3"
SONG = APP / "song" / "agenda.mp3"
OUT = APP / "data" / "agenda" / "audio.json"
FPS = 100
# The source's bar grid (s), fitted on its beats: bar i starts at BAR0 + i * BAR.
BAR0, BAR = 0.1571, 4 * 0.4666786
A0, A1, B0 = BAR0 + 10 * BAR, BAR0 + 22 * BAR, BAR0 + 74 * BAR
DROP, HIT, LENGTH = 2 * BAR, (A1 - A0) + 2 * BAR, 30.0
SECTIONS = [("build", 0.0, DROP), ("chorus", DROP, HIT), ("end", HIT, LENGTH)]


def edit(src: Path) -> None:
    SONG.parent.mkdir(parents=True, exist_ok=True)
    f = (
        f"[0:a]atrim={A0:.3f}:{A1 + 0.02:.3f},asetpts=PTS-STARTPTS[a];[0:a]atrim={B0 - 0.02:.3f}:{B0 + LENGTH:.3f},asetpts=PTS-STARTPTS[b];"
        f"[a][b]acrossfade=d=0.04:c1=tri:c2=tri,afade=t=in:st=0:d=0.05,afade=t=out:st={HIT + 1.6:.3f}:d={LENGTH - HIT - 1.6:.3f},atrim=0:{LENGTH}"
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
    _, beats = librosa.beat.beat_track(onset_envelope=o, sr=sr, hop_length=hop, start_bpm=128.6, tightness=800, units="time", trim=False)
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
        "notes": f"Agenda promo: PaulYudin, Upbeat Uplifting Pop (Pixabay), edit {A0:.2f}-{A1:.2f} + {B0:.2f}- s.",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":")))
    (OUT.parent / "lyrics.json").write_text(json.dumps({"lines": []}))
    print(f"{OUT}: {data['bpm']} BPM, {len(grid)} beats, {len(downbeats)} bars, {len(data['onsets']['kick'])} low hits")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        edit(Path(sys.argv[1]))
    elif not SONG.exists():
        tmp = APP / "song" / "agenda-source.mp3"
        req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://pixabay.com/"})
        tmp.write_bytes(urllib.request.urlopen(req).read())
        edit(tmp)
        tmp.unlink()
    analyze()
