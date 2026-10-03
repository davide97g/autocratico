"""Decode the song and separate it: the inputs every other script reads.

  work/mix.wav        gapless ffmpeg decode of song/write-back.mp3, 44.1 kHz --
                      the timeline a browser plays, so nothing downstream shifts
  stems/htdemucs_ft/  Demucs vocals / drums / bass / other of that decode
  work/vocals16k.wav  the vocal stem, mono 16 kHz, for Whisper

Run:  uv run python prep.py
"""
import common
import shutil
import subprocess
import sys


def main():
    mix = common.WORK / "mix.wav"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(common.AUDIO),
                    "-map", "0:a", "-ar", "44100", str(mix)], check=True)
    out = common.VAR / "stems"
    subprocess.run([sys.executable, "-m", "demucs", "-n", "htdemucs_ft", "-o", str(out), str(mix)], check=True)
    # demucs names the folder after the input file
    shutil.rmtree(common.STEMS, ignore_errors=True)
    (out / "htdemucs_ft" / "mix").replace(common.STEMS)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(common.STEMS / "vocals.wav"),
                    "-ac", "1", "-ar", "16000", str(common.WORK / "vocals16k.wav")], check=True)


if __name__ == "__main__":
    main()
