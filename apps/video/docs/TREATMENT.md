# Autocratico — treatment and style bible

## The idea in one paragraph

An Italian rap track, aggressive and punchy, pitches autocratico in 83 seconds. The first half is a
**riot of paperwork**: registered mail, PEC, F24 forms, tickets from the queue machine, six portals
and six passwords. Stamps slam onto the frame on the snare, each in red. "Follia!" is shouted by a
crowd. Then on the drop ("Il futuro è auto-MA-tico") everything is **redacted by a black bar**. It
**snaps into one quiet, monochrome register**: the real app, in Italian, on iPhone and desktop.

The film has one rule: **colour means time left**. The only hues are the app's four status colours.
In the first half, red is rage. After the drop, red, orange and amber sort the deadlines, and green
appears for the first time when something is done ("Fatto!").

The audience is Italian, so every word on screen is Italian. Mono code and file names stay as they
are (`deadlines.toml`, `git log`).

## Tone

- **Aggressive, then precise.** Before the drop: hard cuts on beats, slam zooms, stamps, camera
  shake, frames packed edge to edge, type cropped by the frame.
  - After the drop: the app's own calm. There is a grid, generous space, slow confident camera
    moves, and the hits land as UI events (a chip changes colour, a card slides in) rather than
    explosions.
  - The contrast between the two halves *is* the pitch.
- **Funny the way a form is funny.**
  - The deadpan comes from bureaucratic objects: a queue ticket, a protocol number, a stamp, a
    "torni martedì alle tre".
  - No caricatures of people, no flags, no pizza.
- **Real imagery, graded into the film.**
  - Freely licensed photos, satellite views and maps live in `public/ref/` (see `CREDITS.md`,
    `manifest.json`):
    - Earth from orbit and a Sentinel-2 zoom into Rome, onto a ministry palace
    - Italy's map and its municipalities
    - office facades, queues, archives of paper
    - rubber stamps, a ticket machine, a marca da bollo
  - Use the `-grey` grades (or grade them yourself) so they sit in the palette. Cut-outs
    (`-cut.png`) are props to drop, stack, stamp and shake.
  - Mix them with the drawn graphics: a photo with a drawn stamp on it, a map with mono labels, a
    real facade with a redaction bar. Keep them print-like and graphic rather than documentary.
  - Every asset used must stay listed in `public/ref/CREDITS.md`.
- **Not slop.**
  - No neon, glowing AI brains, particle nebulae, lens flares or circuit textures.
  - No stock "fintech" (coins, graphs going up, shields with padlocks).
  - Nothing that looks generated.
- **Honest.**
  - Everything the app does on screen, it really does: the inbox, the agent, Telegram reminders at
    08:30, the phishing flag, privacy bars, git history with undo.
  - It never pays and never signs.
  - The screens are real captures (`public/app/`) of the app running on a made-up register (Maria
    Rossi, Bollo auto, Multa ZTL…).
  - Invent the staging, never the features.

## Palette (`src/engine/palette.ts`, from apps/web/src/index.css)

- Base colours:
  - **paper** `#E6E6E6`: the studio grey of the app background, with blurred white shapes
    (`drawStudio`).
  - **sheet** `#FDFDFD`: the cards.
  - **pen** `#0F0F0F`: ink and primary.
  - **ink** `#0A0A0A` / **ink2** `#171717`: the dark plates and the dark "Prossimo adempimento"
    card.
  - **graphite** `#525252`, **muted** `#737373`, **faint** `#A1A1A1`, **bezel** `#DEDEDE`: greys.
- Status colours:
  - **overdue** `#DC2627`: Scaduta, and in the first half the colour of every stamp.
  - **urgent** `#E95C12`: Urgente.
  - **soon** `#EFA810`: In arrivo.
  - **done** `#2A9754`: Fatta. It is held back until the first "Fatto!" in the break (≈ 68.6 s).
    After that it may come back, e.g. as the outro's last chip.
- Paper and dark plates alternate. The paperwork can be off-white paper (forms, envelopes): build
  it from the greys. The registered-mail envelope is the one exception, its own muted green
  (`#7d9a6a`-ish, desaturated), because "busta verde" is a lyric.

## Typography

- **Geist Black** (`F.sans(900)`) for everything shouted: full-bleed, -0.04 em, allowed to be cropped
  by the frame edge, often UPPERCASE.
- **Geist** 400–600 for the sung words when they are set calmly, and for UI.
- **Geist Mono** for the machine: `deadlines.toml`, `git log`, protocol numbers, days left (`−2`,
  `3`, `30`).
- Italian typographic punctuation: « » for quotations as in the lyric, ’ for apostrophes, — dashes.

## Karaoke rules (all plates)

- Every lyric line is **readable** and **synced per word**. A word appears (slams, types, stamps,
  lights) from its `start` and is complete by its `end`. A little anticipation is fine (≤ 0.15 s for
  a slam: the stamp starts falling, and it *hits* on the word's start). Never run ahead of the voice.
- Each plate integrates the lyric differently:
  - stamped on a form
  - printed on a queue ticket
  - typed in a search box
  - a status chip
  - a Telegram message
  - giant cropped type

  The words are part of the image, not subtitles.
- Fast rap lines can show only their **key word big** with the rest of the line small (Geist 500,
  ~34 px) along an edge. Every word must still be on screen while it is sung.
- Keep lyric text in the title-safe area (≥ 80 px from the edges), except deliberately cropped giant
  type where the word stays readable.

## Motifs (`src/scenes/_motifs.ts`)

1. **The stamp.** It slams on the beat, with ink spread, a random angle within ±7° and camera shake
   (`drawStamp` returns the shake). It is red before the drop. After it, at most once: the final
   "AUTOCRATICO!" stamps in pen black.
2. **The redaction bar.** Privacy mode's solid bar.
   - It is the drop's transition: `drawWipe`, black, left to right.
   - In the outro it is literal: every number in the app becomes a bar (the `-privacy` captures).
   - Elsewhere it can hide amounts ("arrivano i costi": the € amounts are bars).
3. **Days left.** A big mono counter coloured by `statusOf()` (−2 red, 3 orange, 30 amber).
4. **Plain text under everything.** At the drop, the UI is what `deadlines.toml` becomes. Behind the
   undo, a `git log` line.
5. **The devices.** The real app in an iPhone (`drawPhone`) or a browser window (`drawBrowser`). On
   paper plates they cast soft studio shadows. Move them like products in a launch film: slow
   parallax, a tilt that settles on a downbeat, never a spin.
6. **The orb.** The chrome orb of the "Prossimo adempimento" card is the one luxe object. It is
   kept for the hero shot.

## The plates

Times are song seconds, from the timeline rules (`src/timeline.ts`). Always read words from
`data/lyrics.json`. Bar k starts at `audio.downbeats[k]` (bar 4 = 11.35 s, the kit; bar 17 =
42.74 s, the drop).

### 1. `open` — the summons (0 – 10.72, intro, no kit)

Shouted:
- "Raccomandata!" at 0.11
- "PEC!" at 4.04
- "F24!" at 5.27
- "Scadenza!" at 7.23, held to 10.7

The synths only, no drums.

- **A continuous zoom from orbit into the State's paperwork.** It is Google-Earth-like, built from
  `public/ref/earth/` (a NASA Earth view, then Sentinel-2 mosaics of Italy, Lazio, Rome and central
  Rome, then a real photo of the Palazzo delle Finanze, the Ministry of Economy and Finance).
- One stamp per shout on the way down:
  - RACCOMANDATA! over the Earth
  - PEC! over Italy
  - F24! over Rome
  - SCADENZA! onto the palace, the biggest stamp, cropped by the frame
- Each stamp brings its object into frame: a registered envelope, a PEC notification row (mono
  sender `protocollo@pec.comune.esempio.it`), an F24 form (drawn plainly, made-up figures as bars).
- While "Scadenza" is held, paper (real cut-outs and drawn forms) rains onto the palace and piles
  up.
- The last half-beat pushes in, ready for the kit at the cut.

### 2. `pile` — gerontocrazia (10.72 – 20.36, verse a, kit enters at 11.35)

Fast rap. One idea per line, cut on downbeats:
- "La burocrazia è per i vecchi: gerontocrazia": a dusty ledger / protocol register (ruled columns,
  mono protocol numbers, a rubber-stamped date). GERONTOCRAZIA stamps across it on its word.
- "sei portali, sei password, e nessuno che ti avvisa": six login windows slam in on the beat, one
  per hit. Each has a plain wordmark-free header: "Portale 1…6" with generic Italian public-service
  labels like "Area riservata", "Accedi con SPID", "Codice fiscale", "Password". On "nessuno che ti
  avvisa" they all show a red error line.
- "IMU, TARI, bollo, la PEC finita nello spam": the three acronyms as stamps, one per word. Then a
  mail list where a PEC row slides down into the "Spam" folder.
- "evado e nemmeno lo so, poi la cartella: bam!": calm small type for "evado e nemmeno lo so". Then
  on "bam!" a *cartella esattoriale* (payment demand) smashes into frame with a red flash (`flash`)
  and big shake.

### 3. `queue` — torni martedì alle tre (20.36 – 29.68, verse b)

- "Busta verde sullo zerbino, già lo so com'è": the green envelope on a doormat, top shot.
- "fila, timbro, numerino: «Torni martedì alle tre»":
  - three hits: a queue, a stamp, a ticket from a queue machine ("Il suo numero: A 247", "In
    attesa: 86").
  - «Torni martedì alle tre» is printed on the ticket.
- "scadenze sparse in mille posti": dates scattered everywhere. Post-its, envelopes and calendar
  pages multiply until they fill the frame.
- "te le ricordano solo quando arrivano i costi": amounts appear as € figures and get redacted to
  bars (motif 2). The last frame is a wall of paper.

### 4. `follia` — the manifesto (29.68 – 41.53, pre-chorus)

Call and response. Each question is set big in Geist and answered by a full-frame red stamp
**FOLLIA!** on the shout. The cut and the stamp land on the beat.

| Lyric | Time (s) |
|---|---|
| "La multa come obiettivo dello Stato?" | 29.68 |
| FOLLIA! | 32.12 |
| "Credere che 'sto casino faccia bene a qualcuno?" | 32.72 |
| "Carte perse, «ripassi domani»?" | 35.16 |
| FOLLIA! | 36.97 |

- Between the stamps, the wall of paper shakes.
- "Le scadenze devono essere visibili! Centralizzate!" (37.54 – 41.26):
  - On "visibili!" everything freezes.
  - On "Centralizzate!" every piece of paper is pulled into one point at the centre, in perspective
    and accelerating.
  - The frame goes white and silent at ~41.3.

### 5. `drop` — il futuro è automatico (41.53 – 46.88, chorus a)

- The pickup "Il futuro è" over white. "auto-MA-tico" lands on bar 17 (42.74): the **black
  redaction bar wipes** the frame.
- Out of it, `deadlines.toml` types itself at speed in mono on ink. These are real fields from the
  demo register (`title = "Bollo auto"`, `date = 2026-10-06`, `severity = "high"`), each block
  coloured by its status.
- "autocratico!" (43.62): giant AUTOCRATICO, white on ink.
- "Pratico, rapido, autocratico!": three hits. The toml blocks slam into bento cards on the beat and
  assemble the Panoramica's grid, which resolves into the real desktop capture in a browser window.

### 6. `inbox` — mandagli tutto (46.88 – 51.48, chorus b)

- "Mandagli tutto, lui legge e archivia": an iPhone with the Inbox capture.
  - Items arrive from the sources: Email, Telegram, Comando rapido, Caricamento.
  - Each one flips "In lavorazione" → "Archiviato" on the beat ("lui legge e archivia").
- "rosso se scade, ti avvisa, e via": cut to the deadlines (desktop or phone `deadlines`).
  - The status chips light up in sync: red on "rosso", orange next.
  - On "ti avvisa" the bell badge counts up ("4").

### 7. `hero` — the next task (51.48 – 54.21, chorus c)

- "Il futuro è automatico, autocratico!" (second time).
- Hero shot: the dark "Prossimo adempimento" card, rebuilt big. The chrome orb floats, and
  "6 ott · Bollo auto · tra 3 gg" with the Urgente chip.
- A slow push and then a pull back reveal it inside the full Panoramica (desktop) beside the phone.
- "autocratico!" lands as the frame settles.

### 8. `italia` — l'Italia lenta e pallosa (54.21 – 61.45, chorus d)

- "In un attimo rivoluzioniamo": a fast montage of the real captures, one per beat: Scadenze,
  Pratiche, Inbox, Attività, Profilo.
- "l'Italia lenta e pallosa":
  - Hard contrast: the paper wall of the first half returns, grey, desaturated, in slow motion
    (dust).
  - It is cut against the app, sharp and fast.
  - "lenta" and "pallosa" are set small and dull, Geist 300 grey.
- "Autocratico!" (60.52): the only black stamp in the film. AUTOCRATICO slams over the paper wall,
  in pen black.

### 9. `phone` — the examples (61.45 – 71.88, break)

Four hard cuts on the downbeats, all on an iPhone, one per line:

1. "Inoltro, scatto, un vocale — in un minuto è archiviato": the three ways in.
   - The iOS share sheet ("Invia ad Autocratico" — draw it plainly), a camera snap, a Telegram
     voice note waveform.
   - Then the Inbox with "Archiviato" ticking in, and a 60 s ring on "in un minuto".
2. "falso mittente, «paga subito»? Phishing, segnalato": the phishing row from the inbox capture.
   - "Rimborso fiscale in attesa…" from `rimborsi@agenzia-entrate-servizi.info`.
   - "⚠️ Possibile phishing: non aprire link e non pagare" highlighted on "segnalato".
3. "Telegram alle otto e mezza: «tra tre giorni» — Fatto!": a Telegram chat (drawn: the bot's
   bubble), and its Italian copy:
   - `🔔 Promemoria` / `• Bollo auto — tra 3 giorni (2026-10-06)` / buttons
     "✓ Fatto: Bollo auto", "+1 h", "Domani 9:00".
   - A clock "08:30".
   - On "Fatto!" the button is tapped and the chip turns **green**: the first green in the film.
4. "non paga mai per me: è un registro, non un ricatto": a greyed `Paga` button that is never
   pressed. Then the Attività capture with the commit list ("Agent: 3 new item(s)") and an
   **Annulla** button, with a mono `git log --oneline` behind it.

The kit stops for the last beats of bar 28 (≈ 70.5 – 71.7): hold still there.

### 10. `chant` — futuro autocratico (71.88 – 76.55)

Two shouts, "futuro autocratico" ×2. The ad-lib before each is not a word.

- A stamp-rhythm montage: every app capture flashes on the beats, one per beat, cropped tight.
- "FUTURO AUTOCRATICO" is set huge, both times, white on ink.
- The second time it is bigger.

### 11. `outro` — the close (76.55 – 83.6)

- Instrumental to ~80.4: the full Panoramica in the browser and the phone side by side, calm, on
  the studio grey.
- Privacy toggle: the `P` key drawn as a keycap. Every number in the overview becomes a bar (swap
  to the `-privacy` captures with a redaction wipe).
- "Il futuro è automatico." (80.38 – 81.9) is set word by word in Geist, centred.
- On the final hit (~81.5) the music cuts: hard black, then the app icon slams in.
- Then, over 1.5 s:
  - the wordmark "Autocratico"
  - the line "Il registro personale della burocrazia italiana"
  - small mono: "open source · i tuoi dati restano a casa"
- The last frame holds.

## Facts that are fair game (all true of the app)

- **Sources:** email (Gmail, read-only), PEC via email, Telegram (also voice notes, transcribed on
  your own server), iOS "Comando rapido", upload / photo, WhatsApp export.
- **The agent:**
  - It files each item within about a minute: deadlines, cases, a timeline line.
  - It flags phishing.
  - Every change is a git commit you can undo.
  - It never pays and never writes to public offices for you.
- **Status:**
  - Scaduta / Urgente / In arrivo / Pianificata / Fatta.
  - Thresholds by severity: high 30/90 days, medium 14/45, low 7/21.
- **Telegram:**
  - Reminders daily at 08:30 with the buttons "✓ Fatto", "+1 h", "Domani 9:00".
  - A weekly summary on Monday at 08:00.
- **Privacy:** `||…||` and the profile become solid bars. Telegram only ever sees redacted text.
- **Hosting:** plain text files (`deadlines.toml`, Markdown cases) on a box at home. Open source.
