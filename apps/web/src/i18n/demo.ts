// Texts of the public demo build (src/demo): imported only there, so the real app never ships them.
import type { Locale } from "@/i18n"

const it = {
  badge: "Demo",
  welcomeTitle: "Prova Autocratico",
  welcomeBody:
    "Ti preparo un registro finto: scadenze, pratiche, email, documenti e spese di una persona inventata. È l'app vera, con l'agente e Claude simulati.",
  points: [
    "Niente account e niente dati veri: tutto resta in questa scheda.",
    "Le modifiche funzionano davvero, ma spariscono quando chiudi la scheda.",
    "Claude è simulato: risponde a un set di domande sul registro.",
  ],
  nameLabel: "Come si chiama la persona del registro?",
  namePlaceholder: "Maria Rossi",
  nameHint: "Facoltativo. Usa un nome inventato: resta nel tuo browser.",
  paletteLabel: "Che stile preferisci? Lo cambi quando vuoi nelle Impostazioni.",
  generate: "Genera il registro",
  generatingTitle: "Preparo il registro…",
  generatingBody:
    "Come farebbe l'agente al primo avvio, leggendo email e documenti.",
  steps: [
    {
      doing: "Leggo la casella delle pratiche…",
      done: "Casella letta: 31 email, 7 utili",
    },
    {
      doing: "Cerco le scadenze fiscali…",
      done: "IMU, acconto IRPEF, 730 e bollo in calendario",
    },
    {
      doing: "Apro le pratiche…",
      done: "4 pratiche: carta d'identità, TARI, facciata, 730",
    },
    {
      doing: "Archivio i documenti…",
      done: "Verbale, polizza, libretto e ricevute archiviati",
    },
    {
      doing: "Sincronizzo l'app Finance…",
      done: "12 mesi di spese ed entrate",
    },
    {
      doing: "Collego Telegram e i promemoria…",
      done: "Bot associato, 2 promemoria attivi",
    },
    {
      doing: "Controllo le regole nel catalogo…",
      done: "IMU, TARI e carta d'identità verificate",
    },
  ],
  readyTitle: (name: string) => `Il registro di ${name} è pronto`,
  readyBody:
    "Fra un minuto arriva un'email nuova: guarda l'agente che la archivia. Prova anche a chiedere qualcosa a Claude.",
  tour: "Fammi fare il giro",
  enter: "Entra",
  bar: "Demo: dati inventati, niente viene salvato",
  barMobile: "Demo: niente è salvato",
  barShort: "Demo",
  restart: "Ricomincia",
  restartConfirm:
    "Ricominciare da capo? Il registro di questa demo viene cancellato.",
  waitlist: "Lista d'attesa",
  hide: "Riduci",
  show: "Mostra le informazioni sulla demo",
  consentTitle: "Statistiche della demo",
  consentBody:
    "Possiamo contare le visite con Google Analytics? Niente di quello che scrivi o carichi viene inviato.",
  consentYes: "Va bene",
  consentNo: "No, grazie",
  privacy: "Privacy",
  copyPrompt: "Copia prompt",
  copyPromptShort: "Prompt",
  copyPromptHint: "Copia il prompt per far installare Autocratico a Claude Code",
  copied: "Copiato",
  copyFailed: "Copia non riuscita",
  fork: "Fork su GitHub",
  forkShort: "Fork",
  prompt: (repo: string) => `Installa Autocratico (${repo}) su questo computer e aiutami a configurarlo.

1. Fai il fork del repository sul mio account GitHub e clonalo (gh repo fork davide97g/autocratico --clone). Se non uso GitHub, clonalo e basta.
2. Prima di toccare qualcosa leggi README.md e AGENTS.md.
3. Controlla i requisiti (Node.js 24, pnpm, Python 3.11, Claude Code) e dimmi cosa manca prima di installare.
4. Lancia ./setup.sh --start e aprimi http://127.0.0.1:8790: l'onboarding chiede nome e masterpass.
5. Poi guidami, un passo alla volta: Telegram (docs/telegram.md), Gmail in sola lettura (docs/gmail.md) e, se voglio un server sempre acceso, docs/deploy-homelab.md.

I miei dati restano nella cartella data/: non va mai committata né pubblicata.`,
}

export type DemoMessages = typeof it

const en: DemoMessages = {
  badge: "Demo",
  welcomeTitle: "Try Autocratico",
  welcomeBody:
    "I'll set up a made-up register: deadlines, cases, emails, documents and spending of an invented person. It's the real app, with the agent and Claude simulated.",
  points: [
    "No account and no real data: everything stays in this tab.",
    "Changes really work, but they are gone when you close the tab.",
    "Claude is simulated: it answers a set of questions about the register.",
  ],
  nameLabel: "What's the name of the register's owner?",
  namePlaceholder: "Maria Rossi",
  nameHint: "Optional. Use a made-up name: it stays in your browser.",
  paletteLabel: "Which look do you like? Change it any time in Settings.",
  generate: "Generate the register",
  generatingTitle: "Setting up the register…",
  generatingBody:
    "As the agent would on its first run, reading emails and documents.",
  steps: [
    {
      doing: "Reading the paperwork mailbox…",
      done: "Mailbox read: 31 emails, 7 useful",
    },
    {
      doing: "Looking for tax deadlines…",
      done: "IMU, IRPEF advance, 730 and car tax on the calendar",
    },
    {
      doing: "Opening the cases…",
      done: "4 cases: identity card, TARI, façade, 730",
    },
    {
      doing: "Filing the documents…",
      done: "Minutes, policy, car papers and receipts filed",
    },
    {
      doing: "Syncing the finance app…",
      done: "12 months of spending and earnings",
    },
    {
      doing: "Connecting Telegram and reminders…",
      done: "Bot paired, 2 reminders set",
    },
    {
      doing: "Checking the rules in the catalog…",
      done: "IMU, TARI and identity card verified",
    },
  ],
  readyTitle: (name: string) => `${name}'s register is ready`,
  readyBody:
    "In a minute a new email arrives: watch the agent file it. Try asking Claude something too.",
  tour: "Show me around",
  enter: "Open it",
  bar: "Demo: made-up data, nothing is saved",
  barMobile: "Demo: nothing is saved",
  barShort: "Demo",
  restart: "Start over",
  restartConfirm: "Start over? This demo's register is deleted.",
  waitlist: "Waiting list",
  hide: "Minimise",
  show: "Show the demo notice",
  consentTitle: "Demo statistics",
  consentBody:
    "May we count visits with Google Analytics? Nothing you type or upload is sent.",
  consentYes: "Fine",
  consentNo: "No, thanks",
  privacy: "Privacy",
  copyPrompt: "Copy prompt",
  copyPromptShort: "Prompt",
  copyPromptHint: "Copy the prompt that has Claude Code install Autocratico",
  copied: "Copied",
  copyFailed: "Could not copy",
  fork: "Fork on GitHub",
  forkShort: "Fork",
  prompt: (repo: string) => `Install Autocratico (${repo}) on this computer and help me set it up.

1. Fork the repository to my GitHub account and clone it (gh repo fork davide97g/autocratico --clone). If I don't use GitHub, just clone it.
2. Before changing anything, read README.md and AGENTS.md.
3. Check the requirements (Node.js 24, pnpm, Python 3.11, Claude Code) and tell me what is missing before installing.
4. Run ./setup.sh --start and open http://127.0.0.1:8790 for me: the onboarding asks for a name and a masterpass.
5. Then walk me through, one step at a time: Telegram (docs/telegram.md), read-only Gmail (docs/gmail.md) and, if I want an always-on server, docs/deploy-homelab.md.

My data stays in the data/ folder: it must never be committed or published.`,
}

export const DEMO_MESSAGES: Record<Locale, DemoMessages> = { it, en }
