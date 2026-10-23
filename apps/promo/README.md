# Autocratico — promo spots (Remotion)

Maintainer-only. Short spots made with [Remotion](https://www.remotion.dev), outside the pnpm workspace
(see `pnpm-workspace.yaml`), next to the code-rendered trailer in `apps/video`.

## The Agenda spot (`Agenda`, 30 s, 1920×1080, 60 fps)

Google Calendar managed by the agent: a hook on the beat, the week filling itself in, the request typed in
the chat, the event landing in the week and turning red, moved after a yes, the alerts on Telegram, an
appointment found in a letter dropped into the month, the end card. The app's pieces are redrawn in React
with its tokens (`src/agenda/ui.tsx`), bigger than in the app so they read on a phone, each one animated on
its own; the calendar is made up (`src/agenda/data.ts`).

- **Timing**: every shot, cut and sound sits on the music's grid (`src/kit/time.ts`): 128.2 BPM, a bar every
  1.872 s, the drop at 3.79 s, a shot every two bars, the end hit at 26.26 s.
- **Music**: "Upbeat Uplifting Pop" by PaulYudin (Pixabay Content License), the same 30-second edit as
  `apps/video/docs/AGENDA.md`. Not in the repository: `tools/music.sh` copies it from `apps/video`.
- **Sound design**: synthesised by `tools/sfx.py` (no samples, no licences), tuned to the track (G major):
  pops for the hook, a pentatonic plink per day of the week, key taps, clicks, whooshes, a riser into the
  drop, impacts, thuds where events land, Telegram chimes, a ding on each confirmation. The cue list is in
  `src/agenda/Agenda.tsx` (`CUES`).
- **Picture**: 3D planes with CSS perspective, camera motion blur (`@remotion/motion-blur`, 6 samples),
  rack focus between the chat and the week, depth of field on the close-up, rings and confetti where things
  land, a push on every downbeat, shakes on the big hits, coloured light sweeps on the cuts.

```sh
bun install
tools/music.sh                              # the track
uv run --with numpy python tools/sfx.py     # the sound effects (public/sfx/)
bun run dev                                 # Remotion Studio
bun run render                              # -> ../../var/video/agenda/agenda-promo-remotion.mp4
```
