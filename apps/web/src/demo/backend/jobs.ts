// The always-on agent, pretended: Gmail syncs that bring scripted emails, triage runs that file what
// arrived (deadlines, cases, archive, a commit each), and the other jobs of the real scheduler.
// One job at a time, like apps/server/src/jobs.ts; /api/jobs/live and the `jobs` event follow them.
import type { JobRun, LiveJobs } from "@autocratico/core"

import { deadline, ACCOUNT } from "./seed"
import {
  changed,
  commit,
  type DemoEmail,
  type DemoInbox,
  type DemoState,
  state,
} from "./state"
import { addDays, hex, nowIso, round2, sleep, slug, today, year } from "./util"

type JobName =
  "gmail" | "triage" | "finance" | "reminders" | "digest" | "backup"
export const JOBS: JobName[] = [
  "gmail",
  "triage",
  "reminders",
  "digest",
  "backup",
  "finance",
]

let current: JobRun | null = null
const waiting: JobName[] = []
let triageAt: string | null = null
let triageTimer: number | undefined

export function live(): LiveJobs {
  const pending = triageAt
    ? state().inbox.filter((i) => i.status === "new").length
    : 0
  return {
    current,
    waiting: [...waiting],
    triage: triageAt && pending ? { at: triageAt, items: pending } : null,
  }
}

/** Starts a job now (or after the current one); the run as it starts. */
export function trigger(name: string): JobRun | null {
  if (!JOBS.includes(name as JobName)) return null
  const job = name as JobName
  if (current) {
    if (current.job !== job && !waiting.includes(job)) waiting.push(job)
    changed("jobs")
    return {
      id: hex(10),
      job,
      started: nowIso(),
      finished: null,
      ok: null,
      summary: "",
    }
  }
  return run(job)
}

/** New items wait a few seconds for more to come, then the agent reads them together. */
export function queueTriage(delayMs = 6000) {
  window.clearTimeout(triageTimer)
  triageAt = new Date(Date.now() + delayMs).toISOString()
  changed("jobs")
  triageTimer = window.setTimeout(() => {
    triageAt = null
    trigger("triage")
  }, delayMs)
}

function run(job: JobName): JobRun {
  const r: JobRun = {
    id: hex(10),
    job,
    started: nowIso(),
    finished: null,
    ok: null,
    summary: "",
    steps: job === "triage" || job === "digest" ? [] : undefined,
  }
  current = r
  changed("jobs", "activity")
  void work(r).then(
    (summary) => finish(r, true, summary),
    (e: Error) => finish(r, false, e.message)
  )
  return { ...r }
}

function finish(r: JobRun, ok: boolean, summary: string) {
  r.finished = nowIso()
  r.ok = ok
  r.summary = summary
  const s = state()
  s.runs.unshift({ ...r })
  s.runs = s.runs.slice(0, 60)
  current = null
  changed("jobs", "activity")
  const next = waiting.shift()
  if (next) window.setTimeout(() => run(next), 400)
}

async function step(
  r: JobRun,
  tool: string | undefined,
  text: string,
  ms = 900
) {
  await sleep(ms)
  r.steps?.push({ at: nowIso(), ...(tool ? { tool } : {}), text })
  changed("jobs")
}

async function work(r: JobRun): Promise<string> {
  const s = state()
  switch (r.job) {
    case "gmail": {
      await sleep(1600)
      const next = ARRIVALS.find((a) => a.mail && !s.arrived.includes(a.id))
      if (!next) return "0 new emails"
      arrive(next)
      return `1 new emails, important first`
    }
    case "triage":
      return triage(r)
    case "finance": {
      await sleep(1200)
      s.mirror.synced_at = nowIso()
      changed("finance")
      return `${s.mirror.transactions.length} transactions, no changes`
    }
    case "reminders":
      await sleep(700)
      return "nothing due"
    case "digest":
      await step(r, "Read", "deadlines.toml", 700)
      await step(r, "Bash", "python3 scripts/upcoming.py 14", 800)
      await step(
        r,
        undefined,
        "Riepilogo della settimana inviato su Telegram.",
        900
      )
      return "sent"
    case "backup":
      await sleep(900)
      return `autocratico-${today()}.tar.gz written, 1 old removed`
    default:
      return "unknown job"
  }
}

// ---------- arrivals: what the agent finds in the mailbox or what the visitor uploads ----------

type Arrival = {
  id: string
  /** Comes through the Gmail sync (the others only from an upload or the chat). */
  mail: boolean
  email: (s: DemoState) => Omit<DemoEmail, "path" | "thread">
  /** What the agent does with it: changes the register, says what it did. */
  file: (
    s: DemoState,
    item: DemoInbox
  ) => {
    outcome: string
    steps: [string | undefined, string][]
    phishing?: boolean
  }
}

const itDay = (iso: string) =>
  new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" }).format(new Date(`${iso}T12:00:00`))
const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`

export const ARRIVALS: Arrival[] = [
  {
    id: "multa",
    mail: true,
    email: (s) => ({
      title: "Verbale di accertamento: divieto di sosta",
      from: `Polizia Locale ${"Comune di Esempio"} <polizialocale@pec.comune.example>`,
      date: nowIso(),
      account: ACCOUNT,
      text: `Si notifica a ${s.name} il verbale n. 000123/EX per sosta in zona rimozione (art. 158 CdS), veicolo targa AB123CD.\n\nImporto: 42,00 €. Se il pagamento avviene entro 5 giorni dalla notifica: 29,40 €.\nEntro 60 giorni è possibile il ricorso al Prefetto.\n\nDocumento di esempio: dati inventati.`,
      files: [],
    }),
    file: (s, item) => {
      const T = today()
      // One deadline per fine: processing the same item again finds it already there.
      const id = `multa-${item.id.slice(0, 6)}`
      commit(
        "Agent: 1 new item(s)",
        () => {
          if (s.deadlines.some((d) => d.id === id)) return
          s.deadlines.push(
            deadline({
              id,
              title: "Multa per sosta, pagamento ridotto",
              area: "vehicles",
              severity: "high",
              date: addDays(T, 5),
              remind_days: [2, 1],
              amount: 29.4,
              source: item.ref,
              notes:
                "29,40 € entro 5 giorni dalla notifica, poi 42,00 € entro 60 giorni. Ricorso al Prefetto entro 60 giorni.",
              finance_category: "cat-auto",
            })
          )
        },
        { body: `- ${item.title}`, files: [`${item.ref}/message.md`] }
      )
      return {
        outcome: `Multa registrata: ${eur(29.4)} entro il ${itDay(addDays(T, 5))} (ridotta del 30%).`,
        steps: [
          ["Read", `${item.ref}/message.md`],
          ["Read", "deadlines.toml"],
          [
            undefined,
            "Mittente: PEC della Polizia Locale del Comune nel profilo. Verbale autentico per forma e dominio.",
          ],
          ["Edit", "deadlines.toml"],
        ],
      }
    },
  },
  {
    id: "tari",
    mail: true,
    email: (s) => {
      const Y = year()
      return {
        title: `Avviso di pagamento TARI ${Y}`,
        from: "Comune di Esempio, Ufficio Tributi <tributi@pec.comune.example>",
        date: nowIso(),
        account: ACCOUNT,
        text: `Gentile ${s.name},\n\nin allegato l'avviso TARI ${Y} per l'immobile di via Roma 12: 287,00 € in due rate.\n\n- prima rata: 143,50 € entro il ${addDays(today(), 10)}\n- seconda rata: 143,50 € entro il ${addDays(today(), 66)}\n\nIl pagamento si effettua con il modulo pagoPA allegato.\n\nDocumento di esempio: dati inventati.`,
        files: [],
      }
    },
    file: (s, item) => {
      fileTari(s, item.ref)
      return {
        outcome: `TARI ${year()}: due rate da ${eur(143.5)} aggiunte al registro.`,
        steps: [
          ["Read", `${item.ref}/message.md`],
          ["Read", `${item.ref}/avviso-tari-${year()}.pdf`],
          ["Read", "deadlines.toml"],
          ["Edit", "deadlines.toml"],
          ["Edit", `cases/${year()}-tari/README.md`],
        ],
      }
    },
  },
  {
    id: "pacco",
    mail: true,
    email: () => ({
      title: "Il tuo pacco è in giacenza: paga 1,99 € di spedizione",
      from: "Poste Spedizioni <avvisi@poste-consegne-online.top>",
      date: nowIso(),
      account: ACCOUNT,
      text: "Il tuo pacco non può essere consegnato. Paga 1,99 € entro 24 ore per riprogrammare la consegna: [link rimosso dalla demo]",
      files: [],
    }),
    file: () => ({
      outcome:
        "⚠️ Possibile phishing: dominio poste-consegne-online.top, chiede un pagamento con urgenza. Nessuna modifica.",
      steps: [
        ["Read", "message.md"],
        [
          undefined,
          "Il dominio non è di Poste Italiane e il messaggio mette fretta: lo segnalo, non apro link.",
        ],
      ],
      phishing: true,
    }),
  },
]

/** The TARI notice: two instalments in place of the undated TARI, and the case updated. */
export function fileTari(s: DemoState, ref: string): string | null {
  const T = today()
  const Y = year()
  if (s.deadlines.some((d) => d.id === `tari-${Y}-1`)) return null
  const made = commit(
    "Agent: 1 new item(s)",
    () => {
      const old = s.deadlines.find((d) => d.id === "tari")
      if (old) old.until = T
      for (const [n, date] of [
        [1, addDays(T, 10)],
        [2, addDays(T, 66)],
      ] as const)
        s.deadlines.push(
          deadline({
            id: `tari-${Y}-${n}`,
            title: `TARI ${Y}, ${n === 1 ? "prima" : "seconda"} rata`,
            area: "home",
            severity: "medium",
            date,
            remind_days: [7, 3],
            amount: 143.5,
            case: `${Y}-tari`,
            source: ref,
            finance_category: "cat-casa",
          })
        )
      const c = s.cases.find((x) => x.slug === `${Y}-tari`)
      if (c)
        c.md = c.md
          .replace("**Status:** in attesa dell'avviso", "**Status:** da pagare")
          .replace(
            "- [ ] Ricevere l'avviso di pagamento",
            "- [x] Ricevere l'avviso di pagamento"
          )
          .replace(
            "- [ ] Inserire le due rate con importo e data",
            "- [x] Inserire le due rate con importo e data"
          )
          .replace(
            /\n$/,
            `\n- ${T} — Avviso arrivato via PEC: ||287 €|| in due rate (${addDays(T, 10)}, ${addDays(T, 66)}). Fonte: ${ref}\n`
          )
    },
    {
      body: `- Avviso di pagamento TARI ${Y}`,
      files: [`${ref}/message.md`, `${ref}/avviso-tari-${Y}.pdf`],
    }
  )
  return made?.hash ?? null
}

/** Saves the email in the archive (as gmail.py does) and returns it. */
export function saveEmail(s: DemoState, a: Arrival): DemoEmail {
  const e = a.email(s)
  const id = hex(6)
  const path = `archive/email/${e.date.slice(0, 10)}-${slug(e.title)}-${id}`
  const mail: DemoEmail = { ...e, path, thread: `19a${hex(13)}` }
  if (a.id === "tari") {
    const pdf = `${path}/avviso-tari-${year()}.pdf`
    s.docs[pdf] = {
      kind: "pdf",
      title: `Avviso di pagamento TARI ${year()}`,
      lines: [
        `Intestatario: ${s.name}`,
        "Immobile: via Roma 12",
        "Totale: 287,00 €",
        `Prima rata: 143,50 € entro il ${addDays(today(), 10)}`,
        `Seconda rata: 143,50 € entro il ${addDays(today(), 66)}`,
        "Documento di esempio: dati inventati.",
      ],
    }
    mail.files.push(pdf)
  }
  s.emails.unshift(mail)
  return mail
}

/** A scripted email reaches the inbox; triage follows. */
export function arrive(a: Arrival): DemoInbox {
  const s = state()
  s.arrived.push(a.id)
  const mail = saveEmail(s, a)
  const item: DemoInbox = {
    id: hex(12),
    folder: `${mail.date.slice(0, 10)}-email-${slug(mail.title)}-${hex(6)}`,
    source: "email",
    status: "new",
    received: nowIso(),
    title: mail.title,
    from: mail.from,
    account: ACCOUNT,
    files: mail.files,
    ref: mail.path,
    outcome: "",
    important: a.id !== "pacco",
    marketing: false,
    content: mail.text,
    arrival: a.id,
  }
  s.inbox.unshift(item)
  changed("inbox", "archive")
  queueTriage(4000)
  return item
}

/** What the agent makes of an upload or a note: by its words, like a quick read of the document. */
function guess(item: DemoInbox): Arrival["file"] {
  const text =
    `${item.title} ${item.content} ${item.files.join(" ")}`.toLowerCase()
  if (/tari|rifiuti/.test(text))
    return (s) => {
      fileTari(s, `inbox/${item.folder}`)
      return {
        outcome: `TARI ${year()}: due rate aggiunte al registro.`,
        steps: [
          ["Read", `inbox/${item.folder}/`],
          ["Edit", "deadlines.toml"],
        ],
      }
    }
  if (/multa|verbale|sanzione|contravvenzione/.test(text))
    return (s, it) => ARRIVALS[0].file(s, { ...it, ref: `inbox/${it.folder}` })
  return (s, it) => {
    const Y = year()
    const area = /bollo|auto|assicuraz|rc\b|revisione/.test(text)
      ? "veicoli"
      : /bollett|luce|gas|acqua|condomin/.test(text)
        ? "casa"
        : /ricett|medic|analisi/.test(text)
          ? "salute"
          : "varie"
    const filed = it.files.map(
      (f) => `archive/${Y}/${area}/${f.split("/").at(-1)}`
    )
    commit(
      "Agent: 1 new item(s)",
      () => {
        for (const [i, f] of it.files.entries())
          if (s.docs[f]) s.docs[filed[i]] = s.docs[f]
      },
      {
        body: `- ${it.title}`,
        files: filed.length ? filed : [`inbox/${it.folder}/content.md`],
      }
    )
    changed("archive")
    return {
      outcome: filed.length
        ? `Archiviato in archive/${Y}/${area}/: nessuna scadenza da aggiungere.`
        : "Nota letta: nessuna scadenza da aggiungere.",
      steps: [
        ["Read", `inbox/${it.folder}/content.md`],
        ...it.files.map((f): [string, string] => ["Read", f]),
        ["Read", "deadlines.toml"],
        [undefined, "Nessuna data o importo da registrare: archiviato."],
      ],
    }
  }
}

async function triage(r: JobRun): Promise<string> {
  const s = state()
  const items = s.inbox.filter((i) => i.status === "new").slice(0, 5)
  if (!items.length) {
    await sleep(500)
    return "nothing to do"
  }
  r.items = items.map((i) => ({ id: i.id, title: i.title }))
  for (const i of items) i.status = "processing"
  changed("inbox", "jobs")
  let processed = 0
  let phishing = 0
  for (const item of items) {
    const scripted = ARRIVALS.find((a) => a.id === item.arrival)
    const work = scripted?.file ?? guess(item)
    await step(
      r,
      "Read",
      item.ref ? `${item.ref}/message.md` : `inbox/${item.folder}/content.md`,
      1100
    )
    const result = work(s, item)
    for (const [tool, text] of result.steps.slice(1))
      await step(r, tool, text, 900)
    item.status = "processed"
    item.outcome = result.outcome
    processed++
    if (result.phishing) phishing++
    changed("inbox", "data", "archive", "activity")
  }
  await step(r, undefined, items.map((i) => i.outcome).join("\n"), 700)
  // The agent's runs count against the subscription, as in Settings.
  const u = s.usage
  u.runs.unshift({
    at: nowIso(),
    source: "triage",
    cost: round2(0.08 + 0.05 * items.length),
    duration_ms: Date.now() - Date.parse(r.started),
    input: 6200,
    output: 900,
    cache_read: 48000,
    cache_write: 3100,
    error: false,
  })
  if (u.limits) {
    u.limits.at = nowIso()
    for (const w of u.limits.windows)
      if (w.utilization !== null)
        w.utilization = Math.min(
          0.95,
          round2(w.utilization + (w.id === "five_hour" ? 0.02 : 0.004))
        )
  }
  changed("usage")
  return `${items.length} items, ${processed} processed${phishing ? `, ${phishing} flagged` : ""}, commit ${s.commits[0]?.hash ?? ""}`.replace(
    /, commit $/,
    ""
  )
}

/** The first email arrives on its own a minute in: the agent is always on. */
export function scheduleFirstArrival(delayMs = 55_000) {
  if (state().arrived.includes("multa")) return
  window.setTimeout(() => {
    if (!state().arrived.includes("multa") && !current) trigger("gmail")
  }, delayMs)
}
