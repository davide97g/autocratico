# Brief for scene authors

You are building plates for the autocratico trailer: a code-rendered video for an Italian rap track
that pitches autocratico (this repo: a personal register for Italian bureaucracy — read /README.md
and /AGENTS.md "Layout"). The engine, data, shared motifs and the app captures exist and work; your
job is your scene module(s) only.

Read first, fully:
1. `apps/video/docs/TREATMENT.md` — concept, tone, palette, type, karaoke rules, motifs, and the
   description of YOUR plate(s). This is the art direction. Follow it; improve on it where you can.
2. `apps/video/docs/ENGINE.md` — the scene API, the toolbox, determinism and motion-blur rules.
3. `apps/video/src/scenes/_motifs.ts`, `src/scenes/_placeholder.ts` (a tiny working example),
   `src/timeline.ts` (your window), `src/engine/palette.ts`.
4. LOOK at the captures you will use in `apps/video/public/app/` (Read the PNGs).
5. For anything the app does on screen, check the source: `apps/web/src/i18n/it.ts` (UI strings),
   `apps/server/src/telegram.ts` and `jobs.ts` (Telegram copy, Italian `it` entries). Copy, don't invent.

Data: `apps/video/data/lyrics.json` (word timings; `this.ctx.lyrics.get('...')`),
`data/audio.json` (beats, downbeats, sections, onsets, envelopes; via `this.ctx.audio`).

Rules:
- Write only `apps/video/src/scenes/<yourscene>.ts` and helpers `src/scenes/<yourscene>-*.ts`.
  Do not edit the engine, `_motifs.ts`, `timeline.ts`, other scenes, `public/`, or anything outside
  apps/video/src/scenes. Do not commit. If you need a motif or engine change, or a new capture, say so
  in your report (work around it meanwhile, e.g. a local copy of a helper in your own -*.ts file).
- Never read `data/` at the repository root or `var/video/appdata/secrets`: the root `data/` is the
  user's personal register. The demo register the captures come from is made up
  (`var/video/appdata`, built by `tools/italian_demo.py`): you may read its deadlines.toml for
  realistic fields.
- Deterministic: a pure function of `f.t` (seeded hashes only). See ENGINE.md.
- Check your work by LOOKING: render stills and contact sheets (`bun scripts/render.ts stills|sheet
  ... --only <id>`, output under `../../var/video/wip/<yourscene>/`) and open the PNGs with Read.
  Check at word starts and ends (is the type synced?), on downbeats (do the hits land?), at the first
  and last frames of your window (does it cut cleanly?). Iterate until it is genuinely good — the
  reference for quality is a launch film by a top design studio (think Apple / Linear / Vercel
  keynote product films crossed with Italian protest posters), not a demo. Expect several rounds.
- Typecheck: `cd apps/video && bunx tsc --noEmit -p tsconfig.json 2>&1 | grep scenes/<yourscene>`.
- Performance: `bun scripts/render.ts perf --from A --to B --only <id>`; aim for < 25 ms per frame.
- Text legible at 1080p. Light plates return `{ paper: 1, grain: ~0.03, vignette: ~0.15 }`.
- Several authors render at the same time on a shared GPU; that is fine. Each `render.ts` call
  starts its own private Vite server if none is running: pass `--url` only if you started one.

Report at the end: what you built (per lyric line, what happens), the stills you checked (paths),
perf numbers, anything you would still improve, and any engine/motif/capture requests.
