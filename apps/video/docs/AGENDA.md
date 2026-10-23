# The Agenda promo (`?film=agenda`)

A 30-second spot for Google Calendar in Autocratico (docs/calendar.md in the repository): upbeat, a cut on
every two bars. Appointments slammed on the beat ("Dentista. CAF. Revisione. Questura. Chi te li ricorda
tutti?"), the drop on the week as the Agenda draws it, the request typed in the chat, the event landing in
the week (red: important), moved after a yes, the alerts on Telegram, an appointment found in a letter added
with one tap, the month. Italian captions, the public demo's made-up register.

## Music

"Upbeat Uplifting Pop" by PaulYudin, on Pixabay (Pixabay Content License: free for commercial use, no
attribution needed; the file itself is not redistributed, so `song/agenda.mp3` is gitignored).
`analysis/agenda.py` downloads it, cuts the edit and writes `data/agenda/audio.json`:

- 128.6 BPM, a bar every 1.872 s from 0.047 s in the edit.
- Bars 10–21 of the track (two bars of groove, the first chorus from bar 12), then a cut to bars 74–75 (the
  same place of the last chorus, the third bar of a four-bar phrase), and the hit that opens the outro.
- In the edit: the drop at 3.79 s, the end hit at 26.26 s, a fade to 30.0 s.

## The edit (`src/scenes/agenda.ts`, one scene)

| s | shot |
|---|---|
| 0.0–1.9 | four appointments, one a beat, each with its date chip in the color of how close it is |
| 1.9–3.8 | "Chi te li ricorda tutti?", a word a beat, a push into the drop |
| 3.8–7.5 | the week swings in and fills in day by day on the half-beats; "La tua agenda." |
| 7.5–11.3 | the chat (real frames): the request typed, Claude answers, "Aggiunto a Google Calendar"; "Dillo a parole." |
| 11.3–15.0 | the event flies from the confirmation onto Thursday 15:00, the glow; close on it, "Importante? Diventa rosso." |
| 15.0–18.8 | "Sposta… a venerdì alle 17", the yes, the event lifts and lands on Friday; "Spostalo. Prima ti chiede." |
| 18.8–22.5 | the phone: three Telegram notifications a beat apart (the alert, today's agenda, the appointment found) |
| 22.5–26.3 | the tap on "Aggiungi", the letter's card drops into the month; "Lo trova nelle lettere." |
| 26.3–30.0 | end card: "autocratico", "La tua agenda, a parole.", "Provalo su demo.autocratico.it" |

Every downbeat after the drop gives the frame a small push; flashes on the drop, the landing, the phone, the
letter and the end.

## Commands

```sh
cd analysis && uv run python agenda.py                  # the track, its edit and analysis
pnpm --filter @autocratico/web dev:demo --port 5199     # from the repository root
bun tools/capture-agenda.ts --url http://localhost:5199
bunx vite                                               # preview: http://localhost:5173/?film=agenda
bun scripts/render.ts video --film agenda --fps 60 --samples 4 --shutter 0.2 --out ../../var/video/agenda/agenda-promo-1080p.mp4
```

The captures depend on the day they are taken (the demo's dates are relative to today): run the capture
and the render on the same day, or the hook's dates and the week's will not match.
