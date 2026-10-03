# Autocratico — the trailer

An 83-second pitch for autocratico: a code-rendered video for an Italian rap track, made in Suno from
a lyric written for this project. Every frame is a deterministic function of song time, so the live
preview in the browser and the offline 1080p60 (or 4K60) export are identical.

This is a bun project of its own, outside the pnpm workspace (see `pnpm-workspace.yaml`). The concept,
style bible and plate-by-plate treatment are in [docs/TREATMENT.md](docs/TREATMENT.md); the engine and
scene API in [docs/ENGINE.md](docs/ENGINE.md).

The app on screen is the real web app. It is captured in Italian on a made-up demo register, never
on personal data.

## Layout

- `song/autocratico.mp3` — the track.
- `lyrics/lyrics.src.json` — the lyric as sung, one line per entry with approximate times.
- `analysis/` — Python (uv) tools that produced the timing data:
  - Demucs stems
  - CTC forced alignment of the Italian lyric (MMS + wav2vec2), cross-checked with Whisper (`it`)
  - a beat tracker (~99.4 BPM), sections, onsets and envelopes
- `data/lyrics.json`, `data/audio.json` — word timings and the music analysis. All the renderer needs.
- `tools/italian_demo.py` — turns a copy of `example/` into the Italian demo register the captures
  show.
- `tools/shot.ts` — screenshot of a design page (model sheet, thumbnail).
- `tools/cutout.swift` — background removal (macOS Vision) for the reference props.
- `tools/capture.ts` — captures that register's web app (desktop and iPhone, it locale) into
  `public/app/`.
- `src/engine/` — renderer core (timeline, post, type, lines).
- `src/scenes/` — one module per plate, plus the shared motifs in `_motifs.ts`.
- `src/timeline.ts` — the edit.
- `scripts/render.ts` — offline renderer (headless Chrome → raw frames over WebSocket → ffmpeg).

Renders, stems, model weights, the demo register and every other intermediate go to the repo's
`var/video/`, which is gitignored.

## Requirements

- [bun](https://bun.sh)
- Google Chrome (driven headless through playwright-core)
- ffmpeg with libx264
- for the analysis: [uv](https://docs.astral.sh/uv/)

## Preview

```sh
cd apps/video
bun install
bunx vite
```

Open http://localhost:5173. `?t=42` starts at a given time (the drop).

| Key | Action |
|---|---|
| space | play / pause |
| ← / → | seek ±1 s (±5 s with shift) |
| `,` / `.` | step one frame |
| `[` / `]` | previous / next scene |
| `l` | loop the current scene |
| `h` | hide the UI |

## Render

```sh
cd apps/video
bun scripts/render.ts video --samples auto --shutter 0.2      # -> ../../var/video/autocratico.mp4
bun scripts/render.ts video --scale 2 --samples auto --shutter 0.2 --x264 aq-mode=3:rc-lookahead=30 --out ../../var/video/autocratico-4k.mp4
bun scripts/render.ts stills --t 42.74,68.61 --only drop,phone  # PNGs to look at
bun scripts/render.ts sheet --from 0 --to 83 --n 32 --cols 8    # a contact sheet
```

## Regenerate the app captures

```sh
rm -rf ../../var/video/appdata
AUTOCRATICO_DATA=$PWD/../../var/video/appdata python3 ../../scripts/init.py
python3 tools/italian_demo.py ../../var/video/appdata
(cd ../.. && pnpm build && AUTOCRATICO_DATA=$PWD/var/video/appdata PORT=8799 node apps/server/src/main.ts) &
bun tools/capture.ts --url http://127.0.0.1:8799
```

## The cut with Bollo

Bollo, the mascot, is a Roman black street cat drawn as a die-cut sticker. He raps the song over
the film. `?bollo=1` adds him as an overlay entry, drawn after every plate, and leaves the plates
untouched; without the flag the film renders as before.
- `src/scenes/_bollo-head.ts` — the drawing.
- `_bollo-rig.ts` — his procedural life:
  - lip-sync from the aligned Italian words
  - damped springs plucked by beats, kicks, snares and syllables
  - blinks and saccades
- `_bollo-choreo.ts` — the cue machinery: anchors, moves, gaze, acts such as scream and bite.
- `bollo-choreo.ts` — the cue list.
- `bollo.ts` — the overlay.

```sh
bun scripts/render.ts video --samples auto --shutter 0.2 --query bollo=1 --out ../../var/video/autocratico-bollo.mp4
```

Design pages, served by `bunx vite`:
- `bollo.html` — the model sheet of the full figure.
- `thumb.html?v=dark|light` — the YouTube thumbnail. To capture it, run
  `bun tools/shot.ts URL out.png`.

Animation tests:
- `--query bollotest=1 --only bollotest`
- `--query bollohead=1 --only bollohead`

## Reference imagery

The photos, satellite views and maps the scenes use (`public/ref/`, about 130 MB) are not in git.
`public/ref/CREDITS.md` lists every file with its source link, author, licence and what was changed;
`public/ref/manifest.json` describes each one. To rebuild the folder:
- download each file from the link in `CREDITS.md`
- regrade it as described there
- cut out props with `swift tools/cutout.swift in.jpg out.png`

The film's end card carries the short credit line.

## Regenerate the data

Only needed if the song or the lyric changes. Run these from `apps/video/analysis`:

```sh
uv run python prep.py            # decode, Demucs stems, 16 kHz vocal
uv run python whisper_run.py     # what was actually sung (a cross-check)
uv run python ctc_emissions.py   # acoustic model emissions for the aligner
uv run python vocal_feats.py
uv run python align.py --plots   # -> data/lyrics.json (+ QA plots in var/video/analysis/qa)
uv run python beats.py
uv run python analyze.py         # -> data/audio.json
```

The models download a few GB into `var/video/analysis/.cache/`; delete it afterwards if you like.

## Credits

- **Song:** lyric written for autocratico; music generated with Suno.
- **Engine:** adapted from [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video) (MIT, see
  [LICENSE.pdoom-video](LICENSE.pdoom-video)) by way of riddle's *Write Back* video:
  - the renderer core
  - the post chain
  - the adaptive motion-blur sampler
  - stroke fonts
  - the analysis pipeline
- **Fonts:**
  - Geist and Geist Mono (Vercel, SIL OFL)
  - Cormorant Garamond (SIL OFL)
  - single-stroke EMS and Hershey fonts (OFL / public domain)
