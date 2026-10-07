# The upright cut (Instagram Reels, YouTube Shorts)

The same film, the same song and timeline, laid out for a 9:16 phone screen. `?aspect=9x16` (render.ts
`--vertical`) turns the logical canvas upright: `W = 1080`, `H = 1920`. The 16:9 film must render
exactly as before: every upright layout is a branch on `VERTICAL` (from `engine/gl`), never a change
to the wide one.

```sh
bun scripts/render.ts stills --vertical --t 30.2,32.2 --only follia --out ../../var/video/wip/v/follia
bun scripts/render.ts sheet --vertical --from 29.68 --to 41.53 --n 16 --cols 8 --only follia --out ../../var/video/wip/v/follia/sheet.png
bun scripts/render.ts video --vertical --samples auto --shutter 0.2 --query bollo=1 --out ../../var/video/autocratico-vertical.mp4
```

## Where things may go

`SAFE` (from `engine/gl`) is the box for text and the subject. Upright it is x 64–920, y 240–1450:

- top 240 px: the platform's header (Reels title, the account on Shorts);
- bottom 470 px: account, caption, audio line, progress bar;
- right 160 px: the like / comment / share / audio column.

Full-bleed imagery (studio, paper, maps, photos, the ink plates) fills the whole frame; nothing that
must be read sits outside `SAFE`. Optical centre of the safe box: about (492, 845). A lyric word may
crop at the left or right frame edge only as deliberate giant type, as in the wide cut.

## How to recompose, not shrink

- **Stack, don't scale.** A wide line of giant type becomes two or three lines, each set as large as
  the width allows (`fitSize` to ~860 px). FOLLIA!, AUTOCRATICO!, FUTURO stay huge: break a word
  with a hyphen only where the wide cut already does (RIVOLU-ZIONIAMO).
- **The phone is the hero.** An iPhone at 1250–1400 px tall fills the safe box; it is the natural
  device here. The desktop browser goes at full width (W − 2·64) and may be cropped by the frame or
  pan slowly; a phone overlapping it at the bottom left keeps the "both devices" idea.
- **Two-column layouts become top/bottom.** Question set big above, stamp below; lyric above, device
  below.
- **Grids and walls** (the paper wall, the six portals, the bento cards) re-flow into 2 columns or a
  tall stack; keep the density, the frame should feel as packed as the wide one.
- **Camera moves** go vertical where they were horizontal (a pan along a row becomes a tilt down a
  column), and zooms keep their centre inside `SAFE`.
- Karaoke rules are unchanged (TREATMENT.md): every word on screen while it is sung, synced per word,
  inside `SAFE`. Small edge lines (Geist 500 ~34 px) sit at `SAFE.left` and above `SAFE.bottom`.
- Text sizes: nothing read below 30 px (a phone shows the frame at ~40% size). Bigger than the wide
  cut is usually right.

## Checklist per plate

- Stills at word starts, downbeats and the first and last frames, looked at.
- A still with the safe box drawn over it in your head: is any word or chip outside it?
- The wide cut still renders as before (render one wide still of your plate before your first edit
  and once more at the end, and compare).
- Typecheck, perf < 25 ms per frame upright too.
