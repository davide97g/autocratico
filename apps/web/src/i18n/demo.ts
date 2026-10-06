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
}

export const DEMO_MESSAGES: Record<Locale, DemoMessages> = { it, en }
