#!/bin/sh
# The Agenda spot's track: the same 30-second edit as apps/video (analysis/agenda.py builds it).
set -e
cd "$(dirname "$0")/.."
[ -f ../video/song/agenda.mp3 ] || (cd ../video/analysis && uv run python agenda.py)
cp ../video/song/agenda.mp3 public/music/agenda.mp3
