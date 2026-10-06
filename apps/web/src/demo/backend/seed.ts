// The made-up register a visitor starts from: Maria Rossi (or the name they typed), a flat and a garage
// in Comune di Esempio, a Fiat Panda. Everything is invented; dates are relative to today, so the
// colours always mean something. The history is built by replaying commits, so Activity, its patches
// and Undo work on it like on the real thing.
//
// Never copy anything from data/ here: names, amounts and documents are all made up.
import type {
  Chat,
  Deadline,
  FinanceCategory,
  FinanceRecurring,
  FinanceTransaction,
  InvestmentSnapshot,
  JobRun,
  UsageRun,
} from "@autocratico/core"

import {
  commit,
  type DemoCase,
  type DemoEmail,
  type DemoInbox,
  type DemoState,
  type DocSpec,
} from "./state"
import {
  addDays,
  addMonths,
  at,
  endOfMonth,
  hex,
  lastOn,
  minutesAgo,
  nextOn,
  prng,
  round2,
  slug,
  today,
  year,
} from "./util"

type DeadlineInput = Partial<Deadline> &
  Pick<Deadline, "id" | "title" | "area" | "date">

export function deadline(
  d: DeadlineInput & { amountTodo?: boolean }
): Deadline {
  const { amountTodo, ...rest } = d
  const base: Deadline = {
    repeat: "none",
    until: null,
    severity: "medium",
    remind_days: [],
    amount: null,
    amounts: {},
    payment: false,
    sensitive: false,
    case: null,
    notes: "",
    source: "",
    finance_category: null,
    finance_recurring: null,
    ...rest,
  }
  base.payment =
    Boolean(amountTodo) ||
    base.amount !== null ||
    Object.keys(base.amounts).length > 0
  return base
}

export const PERSON = {
  plate: "AB123CD",
  car: "Fiat Panda",
  town: "Comune di Esempio",
  street: "via Roma 12",
}
export const ACCOUNT = "pratiche"
export const ADDRESS = "maria.pratiche@example.com"

const folderDate = (iso: string) => iso.slice(0, 10)

function email(
  e: Omit<DemoEmail, "path" | "thread"> & { id?: string }
): DemoEmail {
  const id = e.id ?? hex(6)
  return {
    ...e,
    path: `archive/email/${folderDate(e.date)}-${slug(e.title)}-${id}`,
    thread: `18f${hex(13)}`,
  }
}

function inboxItem(
  i: Omit<
    DemoInbox,
    | "id"
    | "folder"
    | "from"
    | "account"
    | "files"
    | "ref"
    | "outcome"
    | "important"
    | "marketing"
  > &
    Partial<DemoInbox>
): DemoInbox {
  const id = i.id ?? hex(12)
  return {
    from: "",
    account: "",
    files: [],
    ref: "",
    outcome: "",
    important: false,
    marketing: false,
    ...i,
    id,
    folder:
      i.folder ??
      `${folderDate(i.received)}-${i.source}-${slug(i.title)}-${id.slice(0, 6)}`,
  }
}

// ---------- cases and catalog ----------

function cases(
  name: string,
  Y: number,
  T: string,
  docs: { foto: string; cieFront: string; verbale: string; ricevuta730: string }
): DemoCase[] {
  return [
    {
      slug: `${Y}-carta-identita`,
      md: `# Rinnovo carta d'identità

**Status:** da prenotare
**Scadenza:** prenotare entro il ${addDays(T, 6)}
**Ambito:** documenti

## Situazione
- La carta attuale (n. ||CA00000AA||) scade il ||${addDays(T, 129)}||, il giorno del compleanno.
- Le carte cartacee non valgono più dal 3 agosto 2026 (Regolamento UE 2019/1157): la mia è già elettronica.
- Foto tessera arrivata dal telefono: ${docs.foto}
- Carta attuale: ${docs.cieFront}

## Da fare
- [x] Controllare la scadenza del documento attuale
- [x] Fare la foto tessera
- [ ] Prenotare su agendacie.interno.gov.it o all'anagrafe del ${PERSON.town}
- [ ] Portare: carta vecchia, foto tessera, tessera sanitaria, ||22 €|| (verificare l'importo con il Comune)
- [ ] Ritirare la carta e aggiornare \`id_card\` nel profilo

## Timeline
- ${addDays(T, -21)} — Pratica aperta, intestata a ||${name}||.
- ${addDays(T, -7)} — Arrivata la foto tessera dall'iPhone.
`,
    },
    {
      slug: `${Y}-tari`,
      md: `# TARI ${Y}

**Status:** in attesa dell'avviso
**Ambito:** casa

## Situazione
- L'avviso del ${PERSON.town} di solito arriva via PEC a ottobre, con due rate.
- L'anno scorso: ||287 €|| in due rate da ||143,50 €||.
- Le date vanno in deadlines.toml appena arriva l'avviso (oggi la scadenza è "TODO").

## Da fare
- [ ] Ricevere l'avviso di pagamento
- [ ] Inserire le due rate con importo e data
- [ ] Pagare con il modulo allegato (lo fai tu)

## Timeline
- ${addDays(T, -15)} — Pratica aperta dalla chat: TARI senza data, in attesa dell'avviso.
`,
    },
    {
      slug: `${Y}-lavori-facciata`,
      md: `# Lavori straordinari: facciata del condominio

**Status:** in corso
**Ambito:** casa

## Situazione
- Deliberati in assemblea, quota millesimale dell'appartamento: ||31,4||.
- Tre rate straordinarie da ||420 €|| insieme alle ordinarie.
- Verbale dell'assemblea: ${docs.verbale}
- Bonus facciate non più disponibile; da verificare la detrazione per ristrutturazione con il CAF.

## Da fare
- [x] Leggere il verbale
- [x] Segnare le rate straordinarie nel registro
- [ ] Chiedere all'amministratore le fatture per la detrazione
- [ ] Portare le ricevute al CAF con il 730

## Timeline
- ${addDays(T, -18)} — Verbale dell'assemblea arrivato da Amministrazioni Bianchi.
- ${addDays(T, -18)} — Rate straordinarie aggiunte al registro.
`,
    },
    {
      slug: `${Y}-rimborso-730`,
      md: `# Rimborso 730

**Status:** chiusa
**Ambito:** fisco

## Situazione
- 730 precompilato inviato tramite il sito dell'Agenzia delle Entrate.
- Rimborso di ||312 €|| arrivato in busta paga ad agosto.
- Ricevuta di presentazione: ${docs.ricevuta730}

## Da fare
- [x] Controllare il precompilato (spese mediche, interessi del mutuo)
- [x] Inviare entro il 30 settembre
- [x] Verificare il rimborso in busta paga

## Timeline
- ${lastOn(9, 30, T)} — Pratica chiusa: rimborso ricevuto.
`,
    },
  ]
}

function catalog(T: string) {
  const verified = addDays(T, -12)
  return [
    {
      name: "imu",
      md: `# IMU

Ultima verifica: ${verified}.

| Cosa | Regola |
|---|---|
| Acconto | entro il 16 giugno |
| Saldo | entro il 16 dicembre, conguaglio sulle aliquote dell'anno |
| Abitazione principale | esente, tranne le categorie A/1, A/8, A/9 |
| Pertinenze | una per categoria C/2, C/6, C/7 segue l'abitazione principale |

L'IMU non arriva a casa: si calcola da sé (o con il CAF) e si paga con F24.
Se il Comune non cambia le aliquote, il saldo è uguale all'acconto.

Fonti: https://www.finanze.gov.it (Dipartimento delle Finanze, IMU), delibere del Comune.
`,
    },
    {
      name: "tari",
      md: `# TARI

Ultima verifica: ${verified}.

- La tassa sui rifiuti la calcola il Comune: arriva un avviso con l'importo e le rate.
- Numero di rate e scadenze le decide ogni Comune; spesso due o tre, tra ottobre e dicembre.
- Si paga con il modulo allegato (F24 o pagoPA). Chi non riceve l'avviso deve chiederlo all'ufficio tributi.

Fonti: sito del Comune, ufficio tributi.
`,
    },
    {
      name: "carta-identita",
      md: `# Carta d'identità elettronica (CIE)

Ultima verifica: ${verified}.

| Documento | Validità | Note |
|---|---|---|
| CIE, maggiorenni | 10 anni | scade il giorno del compleanno; rinnovabile da 180 giorni prima |
| CIE, 3-18 anni | 5 anni | |
| Tessera sanitaria | 6 anni | rinnovata d'ufficio, arriva per posta |

**Carte d'identità cartacee: non valide dal 3 agosto 2026** (Regolamento UE 2019/1157).
Costo indicativo 22 €, ma alcuni Comuni aggiungono diritti di segreteria.

Fonti: https://www.cartaidentita.interno.gov.it
`,
    },
  ]
}

// ---------- finance ----------

const CATEGORIES: FinanceCategory[] = [
  {
    id: "cat-casa",
    name: "Casa",
    type: "expense",
    color: "#7c8a99",
    excludeFromBudget: false,
  },
  {
    id: "cat-spesa",
    name: "Spesa",
    type: "expense",
    color: "#8a9a7c",
    excludeFromBudget: false,
  },
  {
    id: "cat-bollette",
    name: "Bollette",
    type: "expense",
    color: "#99907c",
    excludeFromBudget: false,
  },
  {
    id: "cat-auto",
    name: "Auto e trasporti",
    type: "expense",
    color: "#7c8f99",
    excludeFromBudget: false,
  },
  {
    id: "cat-tasse",
    name: "Tasse",
    type: "expense",
    color: "#997c7c",
    excludeFromBudget: false,
  },
  {
    id: "cat-salute",
    name: "Salute",
    type: "expense",
    color: "#7c9993",
    excludeFromBudget: false,
  },
  {
    id: "cat-svago",
    name: "Svago",
    type: "expense",
    color: "#937c99",
    excludeFromBudget: false,
  },
  {
    id: "cat-abbonamenti",
    name: "Abbonamenti",
    type: "expense",
    color: "#8a7c99",
    excludeFromBudget: false,
  },
  {
    id: "cat-risparmio",
    name: "Risparmio",
    type: "expense",
    color: null,
    excludeFromBudget: true,
  },
  {
    id: "cat-stipendio",
    name: "Stipendio",
    type: "earning",
    color: "#5f8a6a",
    excludeFromBudget: false,
  },
  {
    id: "cat-altre-entrate",
    name: "Altre entrate",
    type: "earning",
    color: "#6a8a5f",
    excludeFromBudget: false,
  },
]

function finance(T: string) {
  const rand = prng(42)
  const between = (a: number, b: number) => round2(a + rand() * (b - a))
  const tx: FinanceTransaction[] = []
  let n = 0
  const add = (
    date: string,
    amount: number,
    description: string,
    category: string,
    type: "expense" | "earning" = "expense",
    recurringId: string | null = null
  ) => {
    if (date > T) return
    tx.push({
      id: `tx-${(++n).toString(36)}`,
      date,
      amount: round2(amount),
      description,
      category,
      type,
      tag: null,
      recurringId,
    })
  }
  const recurring: FinanceRecurring[] = [
    {
      id: "rec-box",
      description: "Affitto box auto",
      amount: 90,
      category: "cat-casa",
      type: "expense",
      tag: null,
      dayOfMonth: 5,
      active: true,
      lastPeriod: T.slice(0, 7),
    },
    {
      id: "rec-telefono",
      description: "Abbonamento telefono",
      amount: 9.99,
      category: "cat-abbonamenti",
      type: "expense",
      tag: null,
      dayOfMonth: 12,
      active: true,
      lastPeriod: T.slice(0, 7),
    },
    {
      id: "rec-palestra",
      description: "Palestra",
      amount: 39,
      category: "cat-svago",
      type: "expense",
      tag: null,
      dayOfMonth: 1,
      active: true,
      lastPeriod: T.slice(0, 7),
    },
    {
      id: "rec-streaming",
      description: "Streaming",
      amount: 12.99,
      category: "cat-abbonamenti",
      type: "expense",
      tag: null,
      dayOfMonth: 18,
      active: true,
      lastPeriod: T.slice(0, 7),
    },
    {
      id: "rec-pac",
      description: "Piano di accumulo ETF",
      amount: 150,
      category: "cat-risparmio",
      type: "expense",
      tag: null,
      dayOfMonth: 2,
      active: true,
      lastPeriod: T.slice(0, 7),
    },
    {
      id: "rec-stipendio",
      description: "Stipendio",
      amount: 2150,
      category: "cat-stipendio",
      type: "earning",
      tag: null,
      dayOfMonth: 27,
      active: true,
      lastPeriod: T.slice(0, 7),
    },
  ]
  for (let m = 12; m >= 0; m--) {
    const month = addMonths(`${T.slice(0, 7)}-01`, -m)
    const day = (d: number) => addDays(month, d - 1)
    for (const r of recurring)
      add(
        day(r.dayOfMonth),
        r.description === "Stipendio" && month.slice(5, 7) === "12"
          ? 2150 * 2
          : r.amount,
        r.description,
        r.category,
        r.type,
        r.id
      )
    // Groceries about twice a week, the rest when it happens.
    for (let d = 2; d <= 28; d += 3 + Math.floor(rand() * 2))
      add(
        day(d),
        between(18, 74),
        rand() < 0.5 ? "Supermercato" : "Mercato rionale",
        "cat-spesa"
      )
    for (let k = 0; k < 2; k++)
      add(
        day(4 + Math.floor(rand() * 22)),
        between(30, 55),
        "Carburante",
        "cat-auto"
      )
    add(
      day(8 + Math.floor(rand() * 15)),
      between(12, 48),
      rand() < 0.5 ? "Cena fuori" : "Cinema",
      "cat-svago"
    )
    if (rand() < 0.5)
      add(
        day(10 + Math.floor(rand() * 15)),
        between(14, 60),
        "Farmacia",
        "cat-salute"
      )
    const mm = Number(month.slice(5, 7))
    if (mm % 2 === 0)
      add(day(20), between(68, 112), "Bolletta luce e gas", "cat-bollette")
    if (mm % 3 === 1)
      add(day(14), between(38, 52), "Bolletta acqua", "cat-bollette")
    if (mm % 3 === 0) add(day(15), 180, "Rata condominio", "cat-casa")
    if (mm === 6) add(day(16), 405, "IMU acconto (F24)", "cat-tasse")
    if (mm === 12) add(day(16), 405, "IMU saldo (F24)", "cat-tasse")
    if (mm === 8)
      add(day(27), 312, "Rimborso 730", "cat-altre-entrate", "earning")
  }
  return {
    mirror: {
      synced_at: minutesAgo(4),
      transactions: tx.sort((a, b) => a.date.localeCompare(b.date)),
      categories: CATEGORIES,
      tags: [],
      recurring,
    },
  }
}

function investments(T: string): InvestmentSnapshot[] {
  const out: InvestmentSnapshot[] = []
  const tr = [3180, 3290, 3260, 3410, 3520, 3610]
  const dg = [2450, 2480, 2510, 2490, 2560, 2595.5]
  for (let i = 0; i < 6; i++) {
    const date = addMonths(`${T.slice(0, 7)}-01`, i - 5)
    out.push({
      date,
      broker: "Trade Republic",
      cash: round2(180 + i * 12),
      source: i === 5 ? "inbox/trade-republic.png" : "",
      positions: [
        {
          name: "Vanguard FTSE All-World",
          isin: "IE00BK5BQT80",
          quantity: 26 + i * 1.3,
          value: tr[i],
          cost: 2900 + i * 150,
        },
      ],
    })
    out.push({
      date: addDays(date, 2),
      broker: "Degiro",
      cash: 40,
      source: "",
      positions: [
        {
          name: "iShares Core MSCI World",
          isin: "IE00B4L5Y983",
          quantity: 15,
          value: round2(dg[i] - 1010),
          cost: 1500,
        },
        {
          name: "BTP Italia 2030",
          isin: null,
          quantity: null,
          value: 1010,
          cost: 1000,
        },
      ],
    })
  }
  return out
}

// ---------- jobs and usage ----------

function runs(
  T: string,
  triageItems: { id: string; title: string }[][]
): JobRun[] {
  const out: JobRun[] = []
  const run = (
    job: string,
    minutes: number,
    summary: string,
    extra: Partial<JobRun> = {},
    took = 4
  ): JobRun => ({
    id: hex(10),
    job,
    started: minutesAgo(minutes),
    finished: minutesAgo(minutes - took / 60),
    ok: true,
    summary,
    ...extra,
  })
  out.push(run("finance", 4, "1043 transactions, no changes"))
  out.push(run("gmail", 23, "0 new emails"))
  for (let h = 1; h <= 6; h++)
    out.push(
      run("gmail", 23 + h * 60, h === 3 ? "1 new emails" : "0 new emails")
    )
  const [first = [], second = []] = triageItems
  if (first.length)
    out.push(
      run(
        "triage",
        23 + 3 * 60 - 2,
        `${first.length} items, ${first.length} processed, commit 9b77c30`,
        {
          items: first,
          steps: [
            {
              at: minutesAgo(23 + 3 * 60 - 2),
              tool: "Read",
              text: `inbox/${first[0].title}`,
            },
            {
              at: minutesAgo(23 + 3 * 60 - 2),
              tool: "Read",
              text: "deadlines.toml",
            },
            {
              at: minutesAgo(23 + 3 * 60 - 2),
              tool: "Edit",
              text: "deadlines.toml",
            },
            {
              at: minutesAgo(23 + 3 * 60 - 2),
              text: "Estratto conto del condominio archiviato: rata del trimestre confermata, nessuna nuova scadenza.",
            },
          ],
        },
        48
      )
    )
  if (second.length)
    out.push(
      run(
        "triage",
        60 * 26,
        `${second.length} items, ${second.length} processed`,
        { items: second },
        61
      )
    )
  out.push(run("reminders", 60 * 15, "1 due, 0 overdue"))
  out.push(
    run(
      "backup",
      60 * 21,
      "autocratico-" + addDays(T, -1) + ".tar.gz written, 1 old removed"
    )
  )
  out.push(run("digest", 60 * 24 * 3 + 40, "sent", {}, 35))
  return out.sort((a, b) => (a.started < b.started ? 1 : -1))
}

function usage() {
  const rand = prng(7)
  const runsList: UsageRun[] = []
  for (let i = 0; i < 46; i++) {
    const source = (
      ["chat", "chat", "triage", "telegram", "triage", "digest"] as const
    )[i % 6]
    const input = Math.floor(3000 + rand() * 9000)
    runsList.push({
      at: minutesAgo(30 + i * 190 + Math.floor(rand() * 60)),
      source,
      cost: round2(0.02 + rand() * (source === "triage" ? 0.4 : 0.15)),
      duration_ms: Math.floor(
        6000 + rand() * (source === "triage" ? 70000 : 22000)
      ),
      input,
      output: Math.floor(300 + rand() * 1800),
      cache_read: Math.floor(input * (8 + rand() * 12)),
      cache_write: Math.floor(input * rand()),
      error: false,
    })
  }
  const now = Date.now()
  const five = new Date(now + 3 * 3600_000 + 12 * 60_000).toISOString()
  const seven = new Date(now + 3 * 86_400_000 + 5 * 3600_000).toISOString()
  const samples = Array.from({ length: 24 }, (_, i) => ({
    at: new Date(now - (24 - i) * 3 * 3600_000).toISOString(),
    windows: {
      five_hour: round2(Math.min(0.9, 0.05 + ((i * 7) % 11) / 20)),
      seven_day: round2(0.12 + i * 0.012),
    },
  }))
  return {
    limits: {
      at: minutesAgo(30),
      status: "allowed",
      windows: [
        { id: "five_hour", utilization: 0.21, resets_at: five },
        { id: "seven_day", utilization: 0.4, resets_at: seven },
      ],
      overage: { status: null, using: false },
    },
    samples,
    runs: runsList,
  }
}

// ---------- the whole register ----------

export function seed(rawName: string): DemoState {
  const name = rawName.trim().slice(0, 60) || "Maria Rossi"
  const first = name.split(/\s+/)[0]
  const T = today()
  const Y = year(T)

  // Documents first: the cases, emails and inbox items point at them.
  const docs: Record<string, DocSpec> = {}
  const scan = (
    path: string,
    title: string,
    issuer: string,
    lines: string[],
    tone: "paper" | "card" | "photo" = "paper"
  ) => {
    docs[path] = { kind: "scan", title, issuer, lines, tone }
    return path
  }
  const pdf = (path: string, title: string, lines: string[]) => {
    docs[path] = { kind: "pdf", title, lines }
    return path
  }

  const cieFront = scan(
    `archive/${Y}/documenti/cie-fronte.jpg`,
    "Carta d'identità",
    "Repubblica Italiana",
    [
      `Cognome e nome: ${name}`,
      "Comune di emissione: " + PERSON.town,
      `Scadenza: ${addDays(T, 129)}`,
      "N. CA00000AA (esempio)",
    ],
    "card"
  )
  scan(
    `archive/${Y}/documenti/cie-retro.jpg`,
    "Carta d'identità (retro)",
    "Repubblica Italiana",
    ["Codice fiscale: dato di esempio", "Indirizzo: " + PERSON.street],
    "card"
  )
  const libretto = scan(
    `archive/${Y}/veicoli/libretto-panda.jpg`,
    "Carta di circolazione",
    "Ministero dei Trasporti (esempio)",
    [
      `Targa: ${PERSON.plate}`,
      `Veicolo: ${PERSON.car}`,
      "Immatricolazione: 2019-03-31",
      "Revisione: vedi registro",
    ],
    "card"
  )
  const verbale = pdf(
    `archive/${Y}/casa/verbale-assemblea.pdf`,
    "Verbale di assemblea straordinaria",
    [
      "Condominio di via Roma 12, " + PERSON.town,
      `Assemblea del ${addDays(T, -20)}`,
      "Punto 1: rifacimento della facciata. Approvato.",
      "Ripartizione per millesimi; tre rate straordinarie.",
      "Documento di esempio: dati inventati.",
    ]
  )
  const ricevuta730 = pdf(
    `archive/${Y}/fisco/ricevuta-730.pdf`,
    "Ricevuta di presentazione 730",
    [
      `Contribuente: ${name}`,
      `Data invio: ${lastOn(9, 30, T)}`,
      "Esito: accolta",
      "Documento di esempio: dati inventati.",
    ]
  )
  const polizza = pdf(
    `archive/${Y}/casa/polizza-casa.pdf`,
    "Polizza abitazione: rinnovo",
    [
      "Compagnia di esempio S.p.A.",
      `Assicurato: ${name}`,
      `Rinnovo: ${addDays(T, 58)}`,
      "Premio annuo: 96,00 €",
      "Documento di esempio: dati inventati.",
    ]
  )

  // ---------- inbox and archive ----------
  const condoMail = email({
    title: "Estratto conto condominio, 3° trimestre",
    from: "Amministrazioni Bianchi <amministrazione@bianchi.example>",
    date: at(-1, 18, 2),
    account: ACCOUNT,
    text: `Gentile ${name},\n\nin allegato l'estratto conto del terzo trimestre. La rata ordinaria di 180,00 € scade il ${addDays(T, 9)}.\n\nCordiali saluti,\nAmministrazioni Bianchi`,
    files: [],
  })
  condoMail.files.push(
    pdf(
      `${condoMail.path}/estratto-conto-q3.pdf`,
      "Estratto conto 3° trimestre",
      [
        "Condominio di via Roma 12",
        `Condomino: ${name}`,
        "Rata ordinaria: 180,00 €",
        `Scadenza: ${addDays(T, 9)}`,
        "Documento di esempio: dati inventati.",
      ]
    )
  )

  const polizzaMail = email({
    title: "Polizza casa: avviso di rinnovo",
    from: "Compagnia di esempio <rinnovi@assicurazioni.example>",
    date: at(-17, 10, 41),
    account: ACCOUNT,
    text: `Gentile cliente,\n\nla polizza abitazione si rinnova il ${addDays(T, 58)}. Premio annuo: 96,00 €, addebito sul conto indicato.\n\nIn allegato le condizioni.`,
    files: [polizza],
  })
  const verbaleMail = email({
    title: "Verbale assemblea straordinaria: facciata",
    from: "Amministrazioni Bianchi <amministrazione@bianchi.example>",
    date: at(-18, 9, 15),
    account: ACCOUNT,
    text: "Buongiorno,\n\nin allegato il verbale dell'assemblea straordinaria. Le tre rate per la facciata saranno addebitate insieme alle ordinarie.\n\nCordiali saluti",
    files: [verbale],
  })
  const phishMail = email({
    title: "Rimborso fiscale in attesa di conferma",
    from: "Agenzia Entrate Rimborsi <noreply@agenzia-entrate-servizi.info>",
    date: at(-3, 7, 52),
    account: ACCOUNT,
    text: "Gentile contribuente,\n\nrisulta un rimborso di 284,60 € a suo favore. Per riceverlo confermi i dati della carta entro 48 ore al link seguente.\n\n[link rimosso dalla demo]",
    files: [],
  })
  const promoMail = email({
    title: "Offerta luce e gas: blocca il prezzo per 24 mesi",
    from: "Energia Esempio <offerte@energia.example>",
    date: at(-2, 12, 0),
    account: ACCOUNT,
    text: "Solo per pochi giorni: prezzo bloccato per 24 mesi. Passa ora!",
    files: [],
  })
  const emails = [condoMail, phishMail, promoMail, polizzaMail, verbaleMail]

  const fotoItem = inboxItem({
    source: "shortcut",
    status: "processed",
    received: at(-7, 8, 5),
    title: "Foto tessera per la carta d'identità",
    account: `iPhone di ${first}`,
    outcome: "Foto archiviata nella pratica della carta d'identità.",
    content: "Foto tessera, sfondo chiaro.",
  })
  const foto = scan(
    `inbox/${fotoItem.folder}/foto-tessera.jpg`,
    "Foto tessera",
    "Scatto dal telefono",
    ["35 × 45 mm", "Sfondo chiaro, viso centrato"],
    "photo"
  )
  fotoItem.files = [foto]

  const ricevutaItem = inboxItem({
    source: "telegram",
    status: "processed",
    received: at(-4, 19, 33),
    title: "Ricevuta revisione",
    account: `Telegram · ${first}`,
    outcome: "Revisione pagata: prossima tra due anni, importo registrato.",
    content: "Ecco la ricevuta della revisione di oggi.",
  })
  ricevutaItem.files = [
    scan(
      `inbox/${ricevutaItem.folder}/ricevuta.jpg`,
      "Ricevuta revisione",
      "Centro revisioni (esempio)",
      [`Targa: ${PERSON.plate}`, "Esito: regolare", "Importo: 79,02 €"],
      "photo"
    ),
  ]

  const trItem = inboxItem({
    source: "upload",
    status: "processed",
    received: at(-5, 21, 10),
    title: "Screenshot Trade Republic",
    account: "web",
    outcome: "Portafoglio aggiunto in investments.toml.",
    content: "",
  })
  trItem.files = [
    scan(
      `inbox/${trItem.folder}/trade-republic.png`,
      "Portafoglio",
      "Trade Republic (esempio)",
      ["Vanguard FTSE All-World", "Valore: 3.610,00 €", "Liquidità: 240,00 €"],
      "photo"
    ),
  ]

  const inbox: DemoInbox[] = [
    inboxItem({
      source: "email",
      status: "processed",
      received: condoMail.date,
      title: condoMail.title,
      from: condoMail.from,
      account: ACCOUNT,
      ref: condoMail.path,
      important: true,
      outcome: "Rata del trimestre confermata: 180 €, già nel registro.",
      content: condoMail.text,
      files: condoMail.files,
    }),
    inboxItem({
      source: "email",
      status: "processed",
      received: promoMail.date,
      title: promoMail.title,
      from: promoMail.from,
      account: ACCOUNT,
      ref: promoMail.path,
      marketing: true,
      outcome: "Promozione: archiviata senza passare dall'agente.",
      content: promoMail.text,
    }),
    inboxItem({
      source: "email",
      status: "processed",
      received: phishMail.date,
      title: phishMail.title,
      from: phishMail.from,
      account: ACCOUNT,
      ref: phishMail.path,
      outcome:
        "⚠️ Possibile phishing: il dominio non è agenziaentrate.gov.it e chiede i dati della carta. Nessuna modifica.",
      content: phishMail.text,
    }),
    ricevutaItem,
    trItem,
    inboxItem({
      source: "whatsapp",
      status: "processed",
      received: at(-9, 13, 20),
      title: "Chat con l'amministratore",
      account: "WhatsApp",
      outcome:
        "Data dell'assemblea ordinaria aggiunta alla pratica della facciata.",
      content: `[${addDays(T, -9)} 12:58] Amministratore: Buongiorno, l'assemblea ordinaria è fissata per il ${addDays(T, 16)} alle 18.\n[${addDays(T, -9)} 13:02] ${first}: Perfetto, grazie!`,
    }),
    fotoItem,
    inboxItem({
      source: "email",
      status: "processed",
      received: polizzaMail.date,
      title: polizzaMail.title,
      from: polizzaMail.from,
      account: ACCOUNT,
      ref: polizzaMail.path,
      outcome: "Rinnovo della polizza casa aggiunto al registro.",
      content: polizzaMail.text,
      files: polizzaMail.files,
    }),
    inboxItem({
      source: "email",
      status: "ignored",
      received: at(-12, 9, 0),
      title: "Newsletter del Comune: eventi del mese",
      from: `Comune di Esempio <newsletter@comune.example>`,
      account: ACCOUNT,
      outcome: "Nessuna scadenza: ignorata.",
      content: "Gli eventi del mese in città.",
    }),
  ]

  // ---------- the register, built by replaying its history ----------
  const s: DemoState = {
    v: 1,
    created: new Date().toISOString(),
    name,
    deadlines: [],
    done: {},
    profile: {},
    cases: [],
    catalog: catalog(T),
    inbox,
    emails,
    docs,
    chats: [],
    commits: [],
    runs: [],
    reminders: [],
    usage: usage(),
    ...finance(T),
    links: {},
    investments: investments(T),
    financeConnected: true,
    devices: [
      {
        id: hex(8),
        name: `iPhone di ${first}`,
        scope: "ingest",
        created: at(-21, 12, 50),
        last_seen: at(-7, 8, 5),
      },
    ],
    telegram: [{ id: 100200300, name: first, paired: at(-21, 13, 2) }],
    gmail: {
      client: {
        type: "web",
        clientId: "000000000000-demo.apps.googleusercontent.com",
        project: "autocratico-demo",
        redirects: [
          `${typeof location === "undefined" ? "https://demo.invalid" : location.origin}/oauth/gmail`,
        ],
      },
      accounts: [
        {
          name: ACCOUNT,
          query: "-in:spam -in:trash -category:promotions newer_than:1y",
          state: "connected",
          address: ADDRESS,
        },
      ],
    },
    sessions: [
      {
        id: hex(10),
        name: navigatorName(),
        created: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        current: true,
      },
      {
        id: hex(10),
        name: "iPhone",
        created: at(-21, 13, 0),
        last_seen: minutesAgo(95),
        current: false,
      },
    ],
    arrived: [],
  }
  const caseList = cases(name, Y, T, { foto, cieFront, verbale, ricevuta730 })
  const caseBy = (prefix: string) =>
    caseList.find((c) => c.slug.endsWith(prefix))!

  const condoStart = addMonths(addDays(T, 9), -3)
  const waterStart = addDays(T, -2)
  commit(
    "Start tracking the register",
    () => {
      s.profile = {
        person: {
          name,
          birth_date: `1990-${addDays(T, 129).slice(5).replace("02-29", "02-28")}`,
          municipality: `${PERSON.town} (EX)`,
          address: PERSON.street,
          tax_code: "TODO",
          id_card: `${cieFront}, archive/${Y}/documenti/cie-retro.jpg`,
          passport_expiry: "TODO",
        },
        work: { type: "dipendente", employer: "TODO" },
        property: [
          {
            name: "Appartamento",
            municipality: PERSON.town,
            cadastral_category: "A/2",
            main_residence: true,
          },
          {
            name: "Box auto",
            municipality: PERSON.town,
            cadastral_category: "C/6",
            main_residence: false,
          },
        ],
        vehicle: [
          {
            type: "auto",
            model: "TODO",
            plate: "TODO",
            registration_date: "2019-03-31",
          },
        ],
      }
      s.deadlines.push(
        deadline({
          id: "730",
          title: "Dichiarazione 730 precompilata",
          area: "tax",
          severity: "high",
          date: lastOn(9, 30, T),
          repeat: "yearly",
          remind_days: [30, 7],
          notes: "Sul sito dell'Agenzia delle Entrate o tramite CAF.",
        }),
        deadline({
          id: "acconto-irpef-2",
          title: "Secondo acconto IRPEF",
          area: "tax",
          severity: "high",
          date: nextOn(11, 30, T),
          repeat: "yearly",
          remind_days: [14, 3],
          amount: 320,
          notes:
            "Solo se il 730 lo prevede: trattenuto dalla busta paga di novembre.",
        }),
        deadline({
          id: "imu-acconto",
          title: "IMU, acconto",
          area: "home",
          severity: "high",
          date: lastOn(6, 16, T),
          repeat: "yearly",
          remind_days: [14, 3],
          amounts: {
            [addMonths(lastOn(6, 16, T), -12)]: 398,
            [lastOn(6, 16, T)]: 405,
          },
          finance_category: "cat-tasse",
          notes: "Solo il box auto: l'abitazione principale (A/2) è esente.",
        }),
        deadline({
          id: "imu-saldo",
          title: "IMU, saldo",
          area: "home",
          severity: "high",
          date: nextOn(12, 16, T),
          repeat: "yearly",
          remind_days: [14, 3],
          amounts: { [addMonths(nextOn(12, 16, T), -12)]: 405 },
          finance_category: "cat-tasse",
          case: null,
        }),
        deadline({
          id: "condominio",
          title: "Rata condominio",
          area: "home",
          severity: "medium",
          date: condoStart,
          repeat: "every 3 months",
          remind_days: [7],
          amount: 180,
          finance_category: "cat-casa",
        }),
        deadline({
          id: "caldaia",
          title: "Manutenzione caldaia",
          area: "home",
          severity: "medium",
          date: addDays(T, 25),
          repeat: "yearly",
          remind_days: [14],
          amounts: {
            [addMonths(addDays(T, 25), -12)]: 115,
            [addMonths(addDays(T, 25), -24)]: 110,
          },
          notes: "Bollino blu ogni due anni, insieme al controllo fumi.",
        }),
        deadline({
          id: "acqua",
          title: "Bolletta acqua",
          area: "home",
          severity: "medium",
          date: waterStart,
          repeat: "every 3 months",
          remind_days: [5],
          amounts: {
            [addMonths(waterStart, -3)]: 44.2,
            [addMonths(waterStart, -6)]: 41.8,
          },
          finance_category: "cat-bollette",
        }),
        deadline({
          id: "affitto-box",
          title: "Affitto box auto",
          area: "home",
          severity: "low",
          date: addMonths(`${T.slice(0, 7)}-05`, -2),
          repeat: "monthly",
          amount: 90,
          finance_category: "cat-casa",
          finance_recurring: "rec-box",
        }),
        deadline({
          id: "bollo-auto",
          title: "Bollo auto",
          area: "vehicles",
          severity: "high",
          date: endOfMonth(addDays(T, 20)),
          repeat: "yearly",
          remind_days: [14, 3],
          amount: 186.42,
          finance_category: "cat-auto",
          notes:
            "Si paga entro l'ultimo giorno del mese successivo alla scadenza.",
        }),
        deadline({
          id: "rc-auto",
          title: "Rinnovo RC auto",
          area: "vehicles",
          severity: "high",
          date: addDays(T, 127),
          repeat: "yearly",
          remind_days: [30, 7],
          amounts: { [addMonths(addDays(T, 127), -12)]: 412.3 },
          finance_category: "cat-auto",
        }),
        deadline({
          id: "revisione",
          title: "Revisione auto",
          area: "vehicles",
          severity: "medium",
          date: addDays(T, -4),
          repeat: "every 2 years",
          remind_days: [30],
          amount: 79.02,
        }),
        deadline({
          id: "gomme",
          title: "Cambio gomme invernali",
          area: "vehicles",
          severity: "low",
          date: nextOn(11, 15, T),
          repeat: "yearly",
          remind_days: [10],
          notes:
            "Obbligo dal 15 novembre al 15 aprile sulle strade con il cartello.",
        }),
        deadline({
          id: "carta-identita",
          title: "Prenotare la carta d'identità",
          area: "documents",
          severity: "high",
          date: addDays(T, 6),
          remind_days: [3, 1],
          case: caseBy("carta-identita").slug,
        }),
        deadline({
          id: "passaporto",
          title: "Scadenza passaporto",
          area: "documents",
          severity: "medium",
          date: null,
          notes: "La data è sul documento: manca una foto.",
        }),
        deadline({
          id: "patente",
          title: "Rinnovo patente",
          area: "documents",
          severity: "medium",
          date: addDays(T, 290),
          repeat: "every 10 years",
          remind_days: [90, 30],
        }),
        deadline({
          id: "dentista",
          title: "Controllo dal dentista",
          area: "health",
          severity: "low",
          date: addDays(T, 3),
          repeat: "every 6 months",
        }),
        deadline({
          id: "tessera-sanitaria",
          title: "Scadenza tessera sanitaria",
          area: "health",
          severity: "low",
          date: addDays(T, 214),
          notes: "Rinnovata d'ufficio: arriva per posta.",
        }),
        deadline({
          id: "compleanno",
          title: "Compleanno",
          area: "family",
          severity: "low",
          date: nextOn(
            Number(addDays(T, 129).slice(5, 7)),
            Number(addDays(T, 129).slice(8, 10)),
            T
          ),
          repeat: "yearly",
          sensitive: true,
        }),
        deadline({
          id: "isee",
          title: "Rinnovare l'ISEE",
          area: "family",
          severity: "medium",
          date: nextOn(1, 15, T),
          repeat: "yearly",
          remind_days: [14],
        })
      )
      s.done[`730@${lastOn(9, 30, T)}`] = lastOn(9, 30, T)
      s.done[`imu-acconto@${lastOn(6, 16, T)}`] = addDays(lastOn(6, 16, T), -2)
      s.done[`condominio@${condoStart}`] = addDays(condoStart, -1)
      s.done[`affitto-box@${addMonths(`${T.slice(0, 7)}-05`, -2)}`] = addMonths(
        `${T.slice(0, 7)}-05`,
        -2
      )
      if (`${T.slice(0, 7)}-05` <= T)
        s.done[`affitto-box@${T.slice(0, 7)}-05`] = `${T.slice(0, 7)}-05`
      s.cases.push(caseBy("carta-identita"), caseBy("rimborso-730"))
    },
    { s, date: at(-21, 12, 56) }
  )
  commit(
    "Profile: edited in the web app",
    () => {
      const v = s.profile.vehicle as Record<string, string>[]
      v[0] = {
        ...v[0],
        model: PERSON.car,
        plate: PERSON.plate,
        environmental_class: "TODO",
        registration_doc: libretto,
      }
    },
    { s, date: at(-20, 21, 14) }
  )
  commit(
    "Agent: 1 new item(s)",
    () => {
      s.cases.push(caseBy("lavori-facciata"))
      const base = addDays(T, 40)
      s.deadlines.push(
        deadline({
          id: "facciata-1",
          title: "Facciata, rata straordinaria 1/3",
          area: "home",
          severity: "medium",
          date: base,
          amount: 420,
          case: caseBy("lavori-facciata").slug,
          source: verbaleMail.path,
          finance_category: "cat-casa",
        }),
        deadline({
          id: "facciata-2",
          title: "Facciata, rata straordinaria 2/3",
          area: "home",
          severity: "medium",
          date: addMonths(base, 3),
          amount: 420,
          case: caseBy("lavori-facciata").slug,
          source: verbaleMail.path,
          finance_category: "cat-casa",
        }),
        deadline({
          id: "facciata-3",
          title: "Facciata, rata straordinaria 3/3",
          area: "home",
          severity: "medium",
          date: addMonths(base, 6),
          amount: 420,
          case: caseBy("lavori-facciata").slug,
          source: verbaleMail.path,
          finance_category: "cat-casa",
        })
      )
    },
    {
      s,
      date: at(-18, 9, 31),
      body: `- ${verbaleMail.title}`,
      files: [`${verbaleMail.path}/message.md`, verbale],
    }
  )
  commit(
    "Agent: 1 new item(s)",
    () => {
      s.deadlines.push(
        deadline({
          id: "polizza-casa",
          title: "Rinnovo polizza casa",
          area: "home",
          severity: "medium",
          date: addDays(T, 58),
          repeat: "yearly",
          remind_days: [14],
          amount: 96,
          source: polizzaMail.path,
          notes: "Addebito automatico sul conto: controllare solo che arrivi.",
        })
      )
    },
    {
      s,
      date: at(-17, 10, 52),
      body: `- ${polizzaMail.title}`,
      files: [`${polizzaMail.path}/message.md`],
    }
  )
  commit(
    "Chat: TARI senza data, in attesa dell'avviso",
    () => {
      s.deadlines.push(
        deadline({
          id: "tari",
          title: "TARI",
          area: "home",
          severity: "medium",
          date: null,
          amountTodo: true,
          case: caseBy("tari").slug,
          notes:
            "Le date arrivano con l'avviso del Comune, di solito a ottobre.",
        })
      )
      s.cases.push(caseBy("tari"))
    },
    { s, date: at(-15, 20, 40), body: "- add tari\n\nAsked in the web chat." }
  )
  commit(
    "Agent: 1 new item(s)",
    () => {
      const c = s.cases.find((x) => x.slug.endsWith("carta-identita"))!
      c.md = c.md.replace(
        "- [ ] Fare la foto tessera",
        "- [x] Fare la foto tessera"
      )
    },
    { s, date: at(-7, 8, 9), body: `- ${fotoItem.title}`, files: [foto] }
  )
  commit(
    "Agent: 2 new item(s)",
    () => {
      const r = s.deadlines.find((d) => d.id === "revisione")!
      r.date = addDays(T, -4)
      r.notes = "Fatta: esito regolare."
      s.done[`revisione@${addDays(T, -4)}`] = addDays(T, -4)
    },
    {
      s,
      date: at(-4, 19, 41),
      body: `- ${ricevutaItem.title}\n- ${trItem.title}`,
      files: ricevutaItem.files,
    }
  )
  commit(
    "Daily snapshot",
    () => {
      s.done[`affitto-box@${addMonths(`${T.slice(0, 7)}-05`, -1)}`] = addMonths(
        `${T.slice(0, 7)}-05`,
        -1
      )
    },
    { s, date: at(-1, 3, 0) }
  )
  commit(
    "Agent: 1 new item(s)",
    () => {
      const c = s.deadlines.find((d) => d.id === "condominio")!
      c.source = condoMail.path
    },
    {
      s,
      date: at(-1, 18, 9),
      body: `- ${condoMail.title}`,
      files: [`${condoMail.path}/message.md`, ...condoMail.files],
    }
  )

  s.runs = runs(T, [
    [{ id: inbox[0].id, title: inbox[0].title }],
    [
      { id: ricevutaItem.id, title: ricevutaItem.title },
      { id: trItem.id, title: trItem.title },
    ],
  ])
  s.reminders = [
    {
      id: hex(8),
      at: at(5, 9, 0),
      text: "Prenotare la carta d'identità",
      created: at(-6, 21, 3),
      source: "web",
      sent: null,
    },
    {
      id: hex(8),
      at: at(23, 8, 30),
      text: "Chiamare il tecnico della caldaia",
      created: at(-2, 19, 45),
      source: "telegram",
      sent: null,
    },
  ]
  s.chats = chats(T, first)
  return s
}

function navigatorName(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent
  if (/iPhone/.test(ua)) return "iPhone"
  if (/iPad/.test(ua)) return "iPad"
  if (/Android/.test(ua)) return "Android"
  if (/Mac/.test(ua)) return "Mac"
  if (/Windows/.test(ua)) return "Windows"
  return "browser"
}

const itDay = (iso: string) =>
  new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${iso}T12:00:00`))

function chats(T: string, first: string): Chat[] {
  return [
    {
      id: hex(12),
      session: null,
      channel: "web",
      updated: at(-4, 21, 20),
      messages: [
        {
          role: "user",
          text: "Quando scade la revisione della Panda?",
          tools: [],
        },
        {
          role: "assistant",
          text: `L'hai fatta **${itDay(addDays(T, -4))}**, esito regolare: la ricevuta è arrivata su Telegram.\n\nLa prossima è tra due anni, **${itDay(addMonths(addDays(T, -4), 24))}**. Te la ricordo 30 giorni prima.`,
          tools: [
            { name: "Read", detail: "deadlines.toml" },
            { name: "Read", detail: "inbox/…-ricevuta-revisione/content.md" },
          ],
        },
      ],
    },
    {
      id: hex(12),
      session: null,
      channel: "telegram",
      updated: at(-6, 8, 5),
      messages: [
        {
          role: "user",
          text: "Cosa serve per rinnovare la carta d'identità?",
          tools: [],
        },
        {
          role: "assistant",
          text: `Ciao ${first}! Per la CIE ti servono:\n\n- la carta vecchia\n- una foto tessera recente\n- la tessera sanitaria\n- circa ||22 €|| da pagare allo sportello\n\nSi prenota su agendacie.interno.gov.it o all'anagrafe. La pratica è aperta in **Pratiche**.`,
          tools: [
            { name: "Read", detail: "catalog/carta-identita.md" },
            { name: "Read", detail: "cases/…-carta-identita/README.md" },
          ],
        },
      ],
    },
  ]
}
