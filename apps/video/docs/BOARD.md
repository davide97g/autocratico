# The Board promo (`?film=board`)

A 34-second presentation of the Board (docs/generative-ui.md in the repository): a notification asks
"Ti serve un widget?"; in the chat the question is typed, Claude reads the register and answers with a
live preview, one click puts it on the Board. Then "something original": **creative mode** — asked first,
read, run in a sandbox only on the user's yes — and the heatmap it draws. Italian captions, the public
demo's made-up register, no Bollo.

## Music

"Cinematic Inspiring Piano" by Alex_MakeMusic, on Pixabay (Pixabay Content License: free for commercial
use, no attribution needed; the file itself is not to be redistributed, so `song/board.mp3` is gitignored).
`analysis/board.py` downloads it, cuts the edit and writes `data/board/audio.json`:

- 72.67–92.68 s, then 108.68 s onward: the 16-second phrase repeats (chroma similarity 0.86), so the cut is seamless.
- 120 BPM, a bar every 2.00 s. The bass enters at 10.0 (the preview), the full band carries the second
  half from 20.0 ("Creative mode."), the last downbeat at 32.0 is the end card; it rings out to 34.0.

## The edit (`src/scenes/board.ts`, one scene)

| s | shot |
|---|---|
| 0.0–1.6 | the icon and "Autocratico" |
| 1.6–4.0 | an iPhone, Autocratico's notification "Ti serve un widget?", a tap, a dive into it |
| 4.0–10.0 | the chat (real frames): the question typed, sent; Claude reads the files and streams the answer with the preview |
| 10.0–14.0 | close on the preview as its donut draws in; "…e lo disegna", "Sui tuoi dati veri" |
| 14.0–18.0 | "Aggiungi alla Bacheca", the preview flies to its slot, the app's glow and two thin rings; close on it; "Un clic. È in Bacheca." |
| 18.0–21.4 | dark: "E se volessi qualcosa di originale?" / "Creative mode." (brush, gradient) |
| 21.4–26.0 | the yes, the code, "Esegui in sandbox", a box of light closes around it |
| 26.0–29.6 | the box breaks into light that becomes the heatmap; November, then February picked |
| 29.6–32.0 | the Board assembles, card by card; "La tua Bacheca." |
| 32.0–34.0 | end card: "autocratico", "Provalo ora su demo.autocratico.it" |

The app is captured from the public demo by `tools/capture-board.ts` (`public/board/`): stills, the
rectangles the shots animate over (`layout.json`), and the chat typed and answered in real time
(`type-*.jpg`, `think-*.jpg`, their times in `live.json`). The heatmap is redrawn as vectors in
`src/scenes/board-kit.ts` with the app's tokens.

## Commands

```sh
cd analysis && uv run python board.py                 # the track, its edit and analysis
pnpm --filter @autocratico/web dev:demo --port 5199   # from the repository root
bun tools/capture-board.ts --url http://localhost:5199
bunx vite                                             # preview: http://localhost:5173/?film=board
bun scripts/render.ts video --film board --fps 60 --samples 8 --shutter 0.2 --out ../../var/video/board-promo/bacheca-promo-1080p.mp4
```
