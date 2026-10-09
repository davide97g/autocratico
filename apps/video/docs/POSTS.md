# Instagram: the launch set

Six feed posts (1080×1350, 4:5) drawn by `posts.html` with the film's type, palette, props, captures
and mascot, plus the three upright videos. Captions are below, in Italian for an Italian audience.

```sh
cd apps/video
bun tools/posts.ts                 # every slide -> ../../var/video/posts/<post>/NN.png|jpg + sheet.png
bun tools/posts.ts --only phishing
```

Preview a slide in the dev server: `posts.html?p=come-funziona&s=3`. The profile grid shows the
centred 3:4 of each post, so nothing that must be read sits within 80 px of the side edges. Everything
on the slides is true of the app (see TREATMENT.md, "Facts that are fair game", and the landing page's
FAQ). The data shown is the made-up demo register.

## Order

Oldest first. The grid is three wide, so the first nine posts fill it in three rows, Reels in between:

1. `lancio`: the launch post.
2. Reel: the trailer (`autocratico-vertical-share.mp4`, cover `autocratico-cover-dark.jpg`).
3. `problema`: carousel, 5 slides.
4. Reel: `autocratico-follia-share.mp4`.
5. `come-funziona`: carousel, 6 slides.
6. `phishing`: single.
7. Reel: `autocratico-esempi-share.mp4`.
8. `privacy`: carousel, 4 slides.
9. `bollo`: single.

## Captions

Instagram doesn't link URLs in captions: put `autocratico.it` (or the demo) in the bio link.

### 1. lancio

> Raccomandate, PEC, F24, sei portali e sei password. Basta.
>
> Autocratico è il registro personale della burocrazia italiana: scadenze, pagamenti e pratiche in un posto solo, a casa tua. Un agente legge quello che arriva, lo archivia e ti avvisa prima, non dopo.
>
> Open source. Link in bio.
>
> #burocrazia #scadenze #opensource #autocratico

### 2. Reel: the trailer

> La burocrazia è per i vecchi. Il futuro è autocratico. 🔊 Audio on.
>
> Scadenze, pagamenti e pratiche in un registro privato. Open source, a casa tua.
>
> #burocrazia #rap #f24 #pec #scadenze #opensource

### 3. problema

> Raccomandata. PEC. F24. Scadenza.
> Sei portali, sei password, e nessuno che ti avvisa. Le scadenze sono sparse in mille posti e te le ricordano solo quando arrivano i costi.
>
> Scorri fino all’ultima →
>
> #burocrazia #imu #tari #bolloauto #pec #f24

### 4. Reel: Follia

> «La multa come obiettivo dello Stato?» Follia.
> Le scadenze devono essere visibili. Centralizzate.
>
> #burocrazia #multe #scadenze #autocratico

### 5. come-funziona

> Come funziona, in cinque passaggi:
> 1. Mandagli tutto: email e PEC inoltrate, foto, PDF, note vocali su Telegram, export di WhatsApp.
> 2. Lui legge e archivia: scadenza, importo, pratica.
> 3. Il colore è il tempo che resta.
> 4. Ti avvisa su Telegram, con i dati personali oscurati.
> 5. Non paga mai al posto tuo, e ogni modifica si annulla.
>
> Prova la demo: link in bio.
>
> #produttività #burocrazia #telegram #opensource #selfhosted

### 6. phishing

> «Rimborso fiscale in attesa: conferma i tuoi dati». Il mittente non è l’Agenzia delle Entrate.
>
> Autocratico segnala i mittenti che imitano gli enti pubblici e non apre mai i link nei messaggi. È un aiuto, non una garanzia: la decisione resta tua.
>
> #phishing #truffe #agenziaentrate #sicurezza

### 7. Reel: esempi

> Inoltro, scatto, un vocale: in un minuto è archiviato. Telegram alle 08:30, «tra tre giorni». Fatto.
> Non paga mai per te: è un registro, non un ricatto.
>
> #telegram #produttività #burocrazia #autocratico

### 8. privacy

> I tuoi dati restano a casa: una cartella di file di testo sul tuo computer o sul tuo server, niente database, niente cloud di terzi. Modalità Omissis per mostrare l’app senza mostrare te.
>
> Il software è gratuito e open source (MIT). Per l’agente e la chat serve un abbonamento Claude.
>
> #privacy #opensource #selfhosted #homelab

### 9. bollo

> Questo è Bollo. Gatto nero romano, mascotte di Autocratico. Timbra, rappa e non sopporta le code.
> Lo trovi nel trailer.
>
> #gattonero #mascotte #roma #autocratico
