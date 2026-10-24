# The phishing promo (`?film=phishing`)

A 24-second spot for the phishing analysis (an email flagged by the background agent, with why). Short and
sharp: fake senders slammed on the beat ("Rimborso. Pacco. Multa. Conto." over their real domains), "Vera o
falsa?", the drop on the inbox as the row turns red, the analysis read reason by reason, the link that lies
(what it shows, where it really goes), the traps marked in the email on the beat, the warning on Telegram,
the end card. Italian captions, the public demo's made-up register.

## Music

"Dance Upbeat Pop" by Kulakovka, on Pixabay (Pixabay Content License: free for commercial use, no
attribution needed; the file itself is not redistributed, so `song/phishing.mp3` is gitignored).
`analysis/phishing.py` downloads it, cuts the edit and writes `data/phishing/audio.json`:

- 120 BPM, a bar every 2.000 s; the first chorus drops at 16.045 s in the track.
- The last two bars of the build (the riser), the drop, seven bars of chorus, then a cut to the same place
  of the last chorus (the eighth bar of an eight-bar phrase: 30.045 → 110.045 s), and the hit that opens
  the outro.
- In the edit: the drop at 4.0 s, the cut at 18.0 s, the end hit at 20.0 s, a fade to 24.0 s.

## The edit (`src/scenes/phishing.ts`, one scene)

| s | shot |
|---|---|
| 0.0–2.0 | four fake subjects, one a beat, each over the red chip of its sender's real domain |
| 2.0–4.0 | "Vera o falsa?", a word a beat, a push into the drop |
| 4.0–8.0 | the inbox swings in, the flagged row and its "Possibile phishing" badge ring in red; close on the row; "Smascherata." |
| 8.0–12.0 | the analysis (real capture): verdict, then a reason marked on each beat as the card pans; "Ti dice perché." |
| 12.0–16.0 | "Il link mostra www.agenziaentrate.gov.it", struck through, "ma porta a agenziaentrate-rimborsi.top"; "Il link mente." |
| 16.0–18.0 | the email: its three traps swept in, one a beat; "Le trappole, evidenziate." |
| 18.0–20.0 | the phone: the Telegram warning; "Non aprire. Non pagare." |
| 20.0–24.0 | end card: "autocratico", "Il phishing, smascherato.", "Provalo su demo.autocratico.it" |

Every downbeat after the drop gives the frame a small push; flashes on the drop, the analysis, the link,
the marks, the phone and the end.

## Commands

```sh
cd analysis && uv run python phishing.py                # the track, its edit and analysis
pnpm --filter @autocratico/web dev:demo --port 5199     # from the repository root
bun tools/capture-phishing.ts --url http://localhost:5199
bunx vite                                               # preview: http://localhost:5173/?film=phishing
bun scripts/render.ts video --film phishing --fps 60 --samples 4 --shutter 0.2 --out ../../var/video/phishing/phishing-promo-1080p.mp4
```
