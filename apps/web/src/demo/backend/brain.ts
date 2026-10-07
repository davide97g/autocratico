// "Ask Claude" in the demo: no model, a set of scripted answers that read the visitor's register and
// write the same things the real agent writes. Tool steps, a streamed answer, action blocks
// (```change, ```reminder, ```inbox) that the pretend server then carries out as apps/server does
// (chat-actions.ts), and yes/no when a change needs the visitor's word.
import {
  type Chat,
  type ChatEvent,
  extractActions,
  gmailLinks,
  type Occurrence,
  reminderTime,
} from "@autocratico/core"

import { track } from "../analytics"
import { ARRIVALS, queueTriage, saveEmail } from "./jobs"
import { applyChange, ChangeError, data, type Lang } from "./register"
import { ACCOUNT, PERSON } from "./seed"
import { changed, type DemoInbox, state } from "./state"
import {
  addDays,
  endOfMonth,
  hex,
  nowIso,
  reducedMotion,
  round2,
  sleep,
  slug,
  today,
  year,
  ZONE,
} from "./util"

type Tool = [name: string, detail: string]
type Answer = { tools: Tool[]; text: string; confirm?: Pending }
type Pending = { yes: () => Answer; no?: () => Answer }

/** Changes waiting for a yes, per conversation (lost on reload, like an unanswered question). */
const pending = new Map<string, Pending>()

// ---------- words ----------

const TAG = { it: "it-IT", en: "en-GB" }
const L = (lang: Lang, it: string, en: string) => (lang === "it" ? it : en)

function day(iso: string, lang: Lang, weekday = true): string {
  const d = new Date(`${iso}T12:00:00`)
  return new Intl.DateTimeFormat(TAG[lang], {
    ...(weekday ? { weekday: "long" } : {}),
    day: "numeric",
    month: "long",
  }).format(d)
}
function eur(n: number, lang: Lang): string {
  return `||${new Intl.NumberFormat(TAG[lang], { style: "currency", currency: "EUR" }).format(n)}||`
}
function rel(days: number, lang: Lang): string {
  if (days === 0) return L(lang, "oggi", "today")
  if (days === 1) return L(lang, "domani", "tomorrow")
  if (days === -1) return L(lang, "ieri", "yesterday")
  return days > 0
    ? L(lang, `tra ${days} giorni`, `in ${days} days`)
    : L(lang, `${-days} giorni fa`, `${-days} days ago`)
}
const amountOf = (o: Occurrence, lang: Lang) =>
  o.amount_basis === "unknown"
    ? L(lang, "importo da definire", "amount not known yet")
    : o.amount !== null
      ? `${o.amount_basis === "estimate" ? "≈ " : ""}${eur(o.amount, lang)}`
      : ""

const open = (o: Occurrence) => !o.done_on

function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3)
}

/** The deadline a question is about, by the words of its title. */
function findDeadline(text: string, among: Occurrence[]): Occurrence | null {
  const asked = new Set(words(text))
  let best: Occurrence | null = null
  let score = 0
  for (const o of among) {
    const s = words(o.title).filter(
      (w) =>
        asked.has(w) ||
        [...asked].some((a) => a.startsWith(w.slice(0, 5)) && w.length > 4)
    ).length
    if (
      s > score ||
      (s === score && s > 0 && best && Math.abs(o.days) < Math.abs(best.days))
    ) {
      best = o
      score = s
    }
  }
  return score ? best : null
}

// ---------- answers ----------

function week(lang: Lang): Answer {
  const d = data()
  const list = d.agenda
    .filter((o) => open(o) && o.days <= 7 && o.days >= -30)
    .sort((a, b) => a.days - b.days)
  const after = d.agenda.filter((o) => open(o) && o.days > 7)[0]
  const line = (o: Occurrence) =>
    `- **${o.title}**, ${day(o.date, lang)} (${rel(o.days, lang)})${o.amount_basis ? ` · ${amountOf(o, lang)}` : ""}`
  const late = list.filter((o) => o.days < 0)
  const text = list.length
    ? [
        L(
          lang,
          list.length === 1
            ? "Questa settimana hai una cosa:"
            : `Questa settimana hai ${list.length} cose:`,
          list.length === 1
            ? "This week you have one thing:"
            : `This week you have ${list.length} things:`
        ),
        "",
        ...list.map(line),
        "",
        late.length
          ? L(
              lang,
              `${late.length === 1 ? "Una è già scaduta" : `${late.length} sono già scadute`}: se l'hai fatto, premi **Fatto** sulla scadenza.`,
              `${late.length === 1 ? "One is already past due" : `${late.length} are already past due`}: if it is done, press **Done** on it.`
            )
          : "",
        list.some((o) => o.id === "carta-identita")
          ? L(
              lang,
              "Per la carta d'identità la foto tessera è già nella pratica: manca solo l'appuntamento in Comune.",
              "For the identity card the passport photo is already in the case: only the appointment is left."
            )
          : "",
        after
          ? L(
              lang,
              `Subito dopo: **${after.title}**, ${day(after.date, lang)}.`,
              `Right after: **${after.title}**, ${day(after.date, lang)}.`
            )
          : "",
      ]
        .filter((l, i, a) => l || a[i - 1])
        .join("\n")
    : L(
        lang,
        `Niente in scadenza nei prossimi 7 giorni.${after ? ` La prossima è **${after.title}**, ${day(after.date, lang)}.` : ""}`,
        `Nothing due in the next 7 days.${after ? ` Next is **${after.title}**, ${day(after.date, lang)}.` : ""}`
      )
  return {
    tools: [
      ["Bash", "python3 scripts/when.py"],
      ["Read", "deadlines.toml"],
      ["Read", "state.json"],
    ],
    text,
  }
}

function pay(lang: Lang): Answer {
  const d = data()
  const end = endOfMonth()
  const items = d.agenda.filter(
    (o) => open(o) && o.amount_basis && o.date <= end && o.days >= -30
  )
  const known = items.filter((o) => o.amount !== null)
  const total = round2(known.reduce((a, o) => a + (o.amount ?? 0), 0))
  const est = items.some((o) => o.amount_basis === "estimate")
  const unknown = items.some((o) => o.amount_basis === "unknown")
  return {
    tools: [
      ["Read", "deadlines.toml"],
      ["Read", "state.json"],
      ["Read", "finance/summary.md"],
    ],
    text: items.length
      ? [
          L(
            lang,
            `Entro ${day(end, lang, false)} paghi ${est ? "circa " : ""}**${eur(total, lang)}**:`,
            `By ${day(end, lang, false)} you pay ${est ? "about " : ""}**${eur(total, lang)}**:`
          ),
          "",
          ...items.map(
            (o) =>
              `- **${o.title}**, ${day(o.date, lang, false)} · ${amountOf(o, lang)}`
          ),
          "",
          est
            ? L(
                lang,
                "Le voci con ≈ sono stime: la media di quanto hai pagato nell'ultimo anno.",
                "Items with ≈ are estimates: the average of what you paid over the last year."
              )
            : "",
          unknown
            ? L(
                lang,
                "Per quelle senza importo aspetto il documento: mandamelo quando arriva.",
                "For those without an amount I am waiting for the document: send it when it comes."
              )
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : L(
          lang,
          `Entro ${day(end, lang, false)} non hai pagamenti in sospeso.`,
          `Nothing left to pay by ${day(end, lang, false)}.`
        ),
  }
}

function caseSummary(lang: Lang): Answer {
  const d = data()
  const opened = d.cases.filter((c) => c.total === 0 || c.done < c.total)
  const next = d.agenda.find(
    (o) =>
      open(o) &&
      o.case &&
      o.days >= -30 &&
      opened.some((c) => c.slug === o.case)
  )
  const c = opened.find((x) => x.slug === next?.case) ?? opened[0]
  if (!c)
    return {
      tools: [["Glob", "cases/*/README.md"]],
      text: L(lang, "Non hai pratiche aperte.", "You have no open cases."),
    }
  const todo = [...c.md.matchAll(/^\s*- \[( |x)\] (.+)$/gim)].map(
    (m) => `- ${m[1] === "x" ? "✓" : "○"} ${m[2]}`
  )
  return {
    tools: [
      ["Glob", "cases/*/README.md"],
      ["Read", `cases/${c.slug}/README.md`],
      ["Read", "deadlines.toml"],
    ],
    text: [
      `### ${c.title}`,
      "",
      `**${L(lang, "Stato", "Status")}:** ${c.status || "—"}${next ? L(lang, `. In registro: **${next.title}**, ${day(next.date, lang)} (${rel(next.days, lang)}).`, `. In the register: **${next.title}**, ${day(next.date, lang)} (${rel(next.days, lang)}).`) : ""}`,
      "",
      ...todo,
      "",
      L(
        lang,
        `Fatte ${c.done} su ${c.total}. I documenti sono nella pratica, in **Pratiche**.`,
        `${c.done} of ${c.total} done. The documents are in the case, under **Cases**.`
      ),
    ].join("\n"),
  }
}

const PROFILE_LABELS: Record<string, [string, string, string]> = {
  tax_code: ["Codice fiscale", "Tax code", "per controllare gli F24"],
  passport_expiry: [
    "Scadenza del passaporto",
    "Passport expiry",
    "senza, non posso avvisarti",
  ],
  employer: [
    "Datore di lavoro",
    "Employer",
    "per capire se l'acconto IRPEF passa dalla busta paga",
  ],
  environmental_class: [
    "Classe ambientale della Panda",
    "Environmental class of the car",
    "per stimare il bollo",
  ],
  model: ["Modello del veicolo", "Vehicle model", ""],
  plate: ["Targa", "Number plate", ""],
}

function profile(lang: Lang): Answer {
  const s = state()
  const missing: string[] = []
  for (const v of Object.values(s.profile)) {
    for (const row of Array.isArray(v) ? v : [v]) {
      for (const [k, x] of Object.entries(row)) {
        if (x !== "TODO") continue
        const label = PROFILE_LABELS[k]
        missing.push(
          label
            ? `- **${lang === "it" ? label[0] : label[1]}**${lang === "it" && label[2] ? `, ${label[2]}` : ""}`
            : `- \`${k}\``
        )
      }
    }
  }
  const dates = data().incomplete
  return {
    tools: [
      ["Read", "profile.toml"],
      ["Grep", '"TODO"'],
    ],
    text: missing.length
      ? [
          L(
            lang,
            missing.length === 1
              ? "Manca un dato:"
              : `Mancano ${missing.length} dati:`,
            missing.length === 1
              ? "One field is missing:"
              : `${missing.length} fields are missing:`
          ),
          "",
          ...missing,
          "",
          dates.length
            ? L(
                lang,
                `E nel registro ${dates.length === 1 ? "una scadenza è" : `${dates.length} scadenze sono`} senza data (${dates.map((x) => x.title).join(", ")}).`,
                `And ${dates.length === 1 ? "one deadline has" : `${dates.length} deadlines have`} no date yet (${dates.map((x) => x.title).join(", ")}).`
              )
            : "",
          "",
          L(
            lang,
            "Scrivimeli qui o mandami una foto dei documenti in **Inbox**.",
            "Write them here or send me a photo of the documents in **Inbox**."
          ),
        ]
          .filter((l, i, a) => l || a[i - 1])
          .join("\n")
      : L(lang, "Il profilo è completo.", "The profile is complete."),
  }
}

function markPaid(text: string, lang: Lang, about: Occurrence | null): Answer {
  const d = data()
  const candidates = d.agenda.filter(
    (o) => open(o) && o.days >= -60 && o.days <= 120
  )
  const o =
    about && open(about)
      ? about
      : (findDeadline(text, candidates) ??
        candidates
          .filter((x) => x.amount_basis)
          .sort((a, b) => a.days - b.days)[0])
  if (!o)
    return {
      tools: [["Read", "state.json"]],
      text: L(
        lang,
        "Non trovo scadenze aperte da segnare.",
        "I can't find an open deadline to mark."
      ),
    }
  return {
    tools: [
      ["Read", "deadlines.toml"],
      ["Read", "state.json"],
    ],
    text: L(
      lang,
      `La prossima **${o.title}** è di ${day(o.date, lang)}${o.amount_basis ? `, ${amountOf(o, lang)}` : ""}. La segno come fatta?\n\n\`\`\`confirm\n\`\`\``,
      `The next **${o.title}** is on ${day(o.date, lang)}${o.amount_basis ? `, ${amountOf(o, lang)}` : ""}. Shall I mark it done?\n\n\`\`\`confirm\n\`\`\``
    ),
    confirm: {
      yes: () => ({
        tools: [["Read", "state.json"]],
        text: `${L(lang, `Segnata. ${o.repeat !== "none" ? "La prossima resta in calendario." : ""}${o.amount_basis ? " Con una fonte delle finanze collegata, la spesa si registra dal pulsante **Fatto** della scadenza." : ""}`, `Marked. ${o.repeat !== "none" ? "The next one stays in the calendar." : ""}`)}\n\n\`\`\`change\n${JSON.stringify({ summary: `${o.title} ${o.date}: ${L(lang, "fatta", "done")}`, ops: [{ op: "done", key: o.key }] })}\n\`\`\``,
      }),
    },
  }
}

function nextWeekday(target: number): string {
  const T = today()
  const dow = new Date(`${T}T12:00:00`).getDay()
  return addDays(T, (target - dow + 7) % 7 || 7)
}

const WEEKDAYS: [RegExp, number][] = [
  [/luned|monday/, 1],
  [/marted|tuesday/, 2],
  [/mercoled|wednesday/, 3],
  [/gioved|thursday/, 4],
  [/venerd|friday/, 5],
  [/sabato|saturday/, 6],
  [/domenica|sunday/, 0],
]

/** The day a question names: tomorrow, a weekday, "in N days", a dd/mm date. */
function dayIn(t: string): string | null {
  if (/dopodomani|day after tomorrow/.test(t)) return addDays(today(), 2)
  if (/domani|tomorrow/.test(t)) return addDays(today(), 1)
  for (const [re, n] of WEEKDAYS) if (re.test(t)) return nextWeekday(n)
  const m = /tra (\d+) giorni|in (\d+) days/.exec(t)
  if (m) return addDays(today(), Number(m[1] ?? m[2]))
  const dm = /\b(\d{1,2})[/.-](\d{1,2})\b/.exec(t)
  if (dm) {
    const y = year()
    const iso = `${y}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`
    if (!Number.isNaN(Date.parse(iso)))
      return iso < today() ? `${y + 1}${iso.slice(4)}` : iso
  }
  return null
}

function remind(text: string, lang: Lang, about: Occurrence | null): Answer {
  const t = text.toLowerCase()
  const hour = /\b(?:alle|at)\s+(\d{1,2})(?:[:.](\d{2}))?/.exec(t)
  const hh = hour ? Number(hour[1]) : 9
  const mm = hour?.[2] ? Number(hour[2]) : 0
  let on = dayIn(t)
  if (!on && about && /settimana prima|week before/.test(t))
    on = addDays(about.date, -7)
  if (!on && about) on = addDays(about.date, -1)
  on ??= nextWeekday(1)
  if (on < today()) on = addDays(today(), 1)
  const d = data()
  const what =
    about?.title ??
    findDeadline(text, d.agenda.filter(open))?.title ??
    (text
      .replace(
        /^.*?(ricordami( di)?|remind me( to)?|promemoria( per)?)\s*/i,
        ""
      )
      .replace(
        /(?<![\p{L}\d])(dopodomani|domani|tomorrow|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica|monday|tuesday|wednesday|thursday|friday|saturday|sunday|alle \d+([:.]\d+)?|at \d+([:.]\d+)?)(?![\p{L}\d])/giu,
        ""
      )
      .trim() ||
      L(lang, "Controllare il registro", "Check the register"))
  const at = `${on}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
  return {
    tools: [
      [
        "Bash",
        `python3 scripts/when.py "${on} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}"`,
      ],
    ],
    text: `${L(lang, `Ti scrivo su Telegram ${day(on, lang)} alle ${hh}:${String(mm).padStart(2, "0")}: «${what}».`, `I'll message you on Telegram on ${day(on, lang)} at ${hh}:${String(mm).padStart(2, "0")}: "${what}".`)}\n\n\`\`\`reminder\n${JSON.stringify({ at, text: what.charAt(0).toUpperCase() + what.slice(1) })}\n\`\`\``,
  }
}

function imu(lang: Lang): Answer {
  const o = data().agenda.find((x) => x.id === "imu-saldo" && open(x))
  return {
    tools: [
      ["Read", "deadlines.toml"],
      ["Read", "catalog/imu.md"],
      ["WebSearch", "IMU saldo 16 dicembre"],
      ["WebFetch", "https://www.finanze.gov.it"],
    ],
    text: L(
      lang,
      `L'IMU non arriva a casa: si calcola da sé. Il saldo${o ? ` del ${day(o.date, lang, false)}` : ""} l'ho stimato ${o?.amount ? eur(o.amount, lang) : ""} dalle rate già pagate.\n\n**Verificato** · il saldo si paga entro il **16 dicembre** con F24; l'abitazione principale A/2 è esente, quindi riguarda solo il box. Fonte: Dipartimento delle Finanze, controllata oggi (aggiornato \`catalog/imu.md\`).\n\n**Dedotto** · l'importo: se il Comune non cambia le aliquote, il saldo è uguale all'acconto. Lo ricontrollo quando esce la delibera.`,
      `IMU never arrives by post: you work it out yourself. I estimated the balance${o ? ` on ${day(o.date, lang, false)}` : ""} at ${o?.amount ? eur(o.amount, lang) : ""} from the instalments already paid.\n\n**Verified** · the balance is due by **16 December** with an F24; the main home (A/2) is exempt, so it only concerns the garage. Source: Department of Finance, checked today (\`catalog/imu.md\` updated).\n\n**Inferred** · the amount: if the municipality keeps its rates, the balance equals the first instalment. I'll check again when the resolution comes out.`
    ),
  }
}

function noPay(lang: Lang): Answer {
  const t = data().agenda.find((o) => /^tari-/.test(o.id) && open(o))
  return {
    tools: [["Read", "deadlines.toml"]],
    text: L(
      lang,
      `No: non pago mai al posto tuo, non firmo e non scrivo agli enti. Ti preparo importo, scadenza e riferimenti, poi paghi tu.${t ? `\n\nPer la prossima rata TARI: ${amountOf(t, lang)} entro ${day(t.date, lang)}, con il modulo pagoPA allegato all'avviso. Quando hai pagato, premi **Fatto**.` : ""}`,
      `No: I never pay for you, sign or write to public bodies. I prepare the amount, the deadline and the references, then you pay.${t ? `\n\nNext TARI instalment: ${amountOf(t, lang)} by ${day(t.date, lang)}, with the pagoPA form attached to the notice. Once paid, press **Done**.` : ""}`
    ),
  }
}

function findDates(lang: Lang): Answer {
  const inc = data().incomplete
  return {
    tools: [
      ["Read", "deadlines.toml"],
      ["Grep", 'date = "TODO"'],
    ],
    text: inc.length
      ? [
          L(
            lang,
            inc.length === 1 ? "Ne manca una:" : `Ne mancano ${inc.length}:`,
            inc.length === 1 ? "One is missing:" : `${inc.length} are missing:`
          ),
          "",
          ...inc.map((i) => `- **${i.title}**${i.notes ? `: ${i.notes}` : ""}`),
          "",
          inc.some((i) => i.id === "tari")
            ? L(
                lang,
                "Per la TARI incollami il link dell'email del Comune (anche uno qualsiasi di Gmail, nella demo) e la leggo.",
                "For TARI paste the link of the town's email (any Gmail link works in the demo) and I'll read it."
              )
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : L(lang, "Nessuna data mancante.", "No missing dates."),
  }
}

function phish(lang: Lang): Answer {
  const flagged = state().inbox.filter((i) => i.outcome.includes("phishing"))
  if (!flagged.length)
    return {
      tools: [["Glob", "inbox/*/item.json"]],
      text: L(
        lang,
        "Non trovo email sospette nell'inbox.",
        "No suspicious email in the inbox."
      ),
    }
  return {
    tools: [
      ["Glob", "inbox/*/item.json"],
      ...flagged
        .slice(0, 2)
        .map((i): Tool => ["Read", `inbox/${i.folder}/content.md`]),
    ],
    text: [
      L(
        lang,
        `No, ${flagged.length === 1 ? "non è vera" : "non sono vere"}. ${flagged.length === 1 ? "L'ho segnalata" : "Le ho segnalate"} come possibile phishing:`,
        `No. I flagged ${flagged.length === 1 ? "it" : "them"} as possible phishing:`
      ),
      "",
      ...flagged.map(
        (i) =>
          `- **${i.title}**: \`${(/@([^>\s]+)/.exec(i.from)?.[1] ?? i.from).trim()}\``
      ),
      "",
      L(
        lang,
        "I domini non sono quelli ufficiali (agenziaentrate.gov.it, poste.it) e chiedono dati o pagamenti con urgenza. Non aprire i link: i rimborsi veri si vedono nell'area riservata del sito dell'Agenzia.",
        "The domains are not the official ones (agenziaentrate.gov.it, poste.it) and they ask for data or money in a hurry. Don't open the links: real refunds show up in your area on the Agency's website."
      ),
    ].join("\n"),
  }
}

function tariState(lang: Lang): Answer {
  const rates = data().agenda.filter((o) => /^tari-\d{4}-\d$/.test(o.id))
  if (rates.length)
    return {
      tools: [["Read", "deadlines.toml"]],
      text: [
        L(
          lang,
          `L'avviso TARI è nel registro: ${rates.length} rate.`,
          `The TARI notice is in the register: ${rates.length} instalments.`
        ),
        "",
        ...rates.map(
          (o) =>
            `- **${o.title}**, ${day(o.date, lang)} · ${amountOf(o, lang)}${o.done_on ? L(lang, " · pagata", " · paid") : ""}`
        ),
      ].join("\n"),
    }
  return findDates(lang)
}

function gmail(link: string, lang: Lang): Answer {
  const s = state()
  const Y = year()
  if (s.deadlines.some((d) => d.id === `tari-${Y}-1`)) return tariState(lang)
  const a = ARRIVALS.find((x) => x.id === "tari")!
  let mail = s.emails.find((e) =>
    e.title.startsWith(`Avviso di pagamento TARI ${Y}`)
  )
  if (!mail) {
    mail = saveEmail(s, a)
    s.arrived.push("tari")
    changed("archive")
  }
  const first = addDays(today(), 10)
  const second = addDays(today(), 66)
  const ref = mail.path
  return {
    tools: [
      ["Gmail", threadOf(link)],
      ["Read", `${ref}/message.md`],
      ["Read", `${ref}/avviso-tari-${Y}.pdf`],
      ["Read", "deadlines.toml"],
      ["Read", "catalog/tari.md"],
    ],
    text: L(
      lang,
      `È l'avviso **TARI ${Y}** del ${PERSON.town}, intestato a ||${s.name}||: ${eur(287, lang)} in due rate.\n\n- prima rata, ${eur(143.5, lang)} entro **${day(first, lang)}**\n- seconda rata, ${eur(143.5, lang)} entro **${day(second, lang)}**\n\nIl mittente è la PEC dell'ufficio tributi del Comune che hai nel profilo. Aggiungo le due rate al registro, al posto della TARI senza data?\n\n\`\`\`confirm\n\`\`\``,
      `It's the **TARI ${Y}** notice from ${PERSON.town}, addressed to ||${s.name}||: ${eur(287, lang)} in two instalments.\n\n- first, ${eur(143.5, lang)} by **${day(first, lang)}**\n- second, ${eur(143.5, lang)} by **${day(second, lang)}**\n\nThe sender is the town's tax office certified address. Shall I add both to the register, in place of the undated TARI?\n\n\`\`\`confirm\n\`\`\``
    ),
    confirm: {
      yes: () => ({
        tools: [["Read", "deadlines.toml"]],
        text: `${L(lang, "Fatto: due rate in **Casa**, con promemoria 7 e 3 giorni prima. Il pagamento lo fai tu, con il modulo allegato all'avviso.", "Done: two instalments under **Home**, with reminders 7 and 3 days before. You pay them yourself, with the form attached to the notice.")}\n\n\`\`\`change\n${JSON.stringify(
          {
            summary: `TARI ${Y}, due rate dall'avviso del Comune`,
            ops: [
              {
                op: "add",
                deadline: {
                  id: `tari-${Y}-1`,
                  title: `TARI ${Y}, prima rata`,
                  area: "home",
                  date: first,
                  severity: "medium",
                  remind_days: [7, 3],
                  amount: 143.5,
                  case: `${Y}-tari`,
                  source: ref,
                },
              },
              {
                op: "add",
                deadline: {
                  id: `tari-${Y}-2`,
                  title: `TARI ${Y}, seconda rata`,
                  area: "home",
                  date: second,
                  severity: "medium",
                  remind_days: [7, 3],
                  amount: 143.5,
                  case: `${Y}-tari`,
                  source: ref,
                },
              },
              { op: "close", id: "tari" },
            ],
          }
        )}\n\`\`\`\n\`\`\`reminder\n${JSON.stringify({ at: `${addDays(first, -7)}T08:30`, text: `TARI ${Y}, prima rata` })}\n\`\`\``,
      }),
      no: () => ({
        tools: [],
        text: L(
          lang,
          "Va bene, la lascio com'è. L'email resta in **Archivio** se cambi idea.",
          "Fine, I'll leave it. The email stays in the **Archive** if you change your mind."
        ),
      }),
    },
  }
}

/** The conversation id at the end of a Gmail link. */
function threadOf(url: string): string {
  const th = /[?&](?:th|permthid|permmsgid)=([^&#]+)/.exec(url)
  return (
    th?.[1] ??
    (url.split("#")[1] ?? "")
      .split("?")[0]
      .replace(/\/+$/, "")
      .split("/")
      .at(-1) ??
    url
  )
}

function move(
  text: string,
  lang: Lang,
  about: Occurrence | null
): Answer | null {
  const t = text.toLowerCase()
  const on = dayIn(t)
  const o =
    about ??
    findDeadline(
      text,
      data().agenda.filter((x) => open(x) && x.days >= -30)
    )
  if (!on || !o) return null
  return {
    tools: [
      ["Read", "deadlines.toml"],
      ["Bash", `python3 scripts/when.py ${on}`],
    ],
    text: L(
      lang,
      `Sposto **${o.title}** dal ${day(o.date, lang)} a **${day(on, lang)}**${o.repeat !== "none" ? " (anche le successive slittano di conseguenza)" : ""}. Confermi?\n\n\`\`\`confirm\n\`\`\``,
      `I'll move **${o.title}** from ${day(o.date, lang)} to **${day(on, lang)}**${o.repeat !== "none" ? " (later ones shift with it)" : ""}. Confirm?\n\n\`\`\`confirm\n\`\`\``
    ),
    confirm: {
      yes: () => ({
        tools: [],
        text: `${L(lang, "Spostata.", "Moved.")}\n\n\`\`\`change\n${JSON.stringify({ summary: `${o.title}: ${L(lang, "nuova data", "new date")} ${on}`, ops: [{ op: "update", id: o.id, set: { date: on } }] })}\n\`\`\``,
      }),
    },
  }
}

function spending(lang: Lang): Answer {
  const s = state()
  if (!s.financeConnected)
    return {
      tools: [["Read", "finance/summary.md"]],
      text: L(
        lang,
        "Nessuna fonte delle finanze collegata: la colleghi da **Impostazioni**.",
        "No finance source is connected: connect one in **Settings**."
      ),
    }
  const month = today().slice(0, 7)
  const prev = addDays(`${month}-01`, -1).slice(0, 7)
  const sum = (m: string) => {
    const by = new Map<string, number>()
    for (const tx of s.mirror.transactions)
      if (
        tx.type === "expense" &&
        tx.date.startsWith(m) &&
        tx.category !== "cat-risparmio"
      )
        by.set(tx.category, (by.get(tx.category) ?? 0) + tx.amount)
    return by
  }
  const now = sum(month)
  const before = sum(prev)
  const total = [...now.values()].reduce((a, b) => a + b, 0)
  const totalBefore = [...before.values()].reduce((a, b) => a + b, 0)
  const name = (id: string) =>
    s.mirror.categories.find((c) => c.id === id)?.name ?? id
  const top = [...now.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
  return {
    tools: [["Read", "finance/summary.md"]],
    text: [
      L(
        lang,
        `Questo mese hai speso ${eur(round2(total), lang)} (il mese scorso ${eur(round2(totalBefore), lang)} in tutto).`,
        `This month you spent ${eur(round2(total), lang)} (last month ${eur(round2(totalBefore), lang)} in all).`
      ),
      "",
      ...top.map(([c, v]) => `- **${name(c)}**: ${eur(round2(v), lang)}`),
      "",
      L(
        lang,
        "Il dettaglio è in **Finanze**, con le spese future dal registro.",
        "The details are under **Finance**, with future expenses from the register."
      ),
    ].join("\n"),
  }
}

function aboutSteps(o: Occurrence, lang: Lang): Answer {
  const s = state()
  const c = o.case ? s.cases.find((x) => x.slug === o.case) : null
  const todo = c
    ? [...c.md.matchAll(/^\s*- \[ \] (.+)$/gim)].map(
        (m, i) => `${i + 1}. ${m[1]}`
      )
    : []
  return {
    tools: [
      ["Read", "deadlines.toml"],
      ...(c ? [["Read", `cases/${c.slug}/README.md`] as Tool] : []),
      ...(o.source ? [["Read", o.source] as Tool] : []),
    ],
    text: [
      L(
        lang,
        `**${o.title}**, ${day(o.date, lang)} (${rel(o.days, lang)})${o.amount_basis ? ` · ${amountOf(o, lang)}` : ""}.`,
        `**${o.title}**, ${day(o.date, lang)} (${rel(o.days, lang)})${o.amount_basis ? ` · ${amountOf(o, lang)}` : ""}.`
      ),
      "",
      ...(todo.length
        ? todo
        : [
            L(
              lang,
              "1. Controlla importo e scadenza qui sopra",
              "1. Check the amount and date above"
            ),
            o.amount_basis
              ? L(
                  lang,
                  "2. Paga con il modulo del documento (F24, pagoPA o addebito)",
                  "2. Pay with the document's form (F24, pagoPA or direct debit)"
                )
              : L(
                  lang,
                  "2. Fai quello che serve entro la data",
                  "2. Do what it takes by the date"
                ),
            L(
              lang,
              "3. Premi **Fatto**: la prossima resta in calendario",
              "3. Press **Done**: the next one stays in the calendar"
            ),
          ]),
      o.notes ? `\n${o.notes}` : "",
    ].join("\n"),
  }
}

function aboutSource(o: Occurrence, lang: Lang): Answer {
  const s = state()
  const mail = o.source
    ? s.emails.find((e) => o.source.startsWith(e.path))
    : null
  const item = o.source
    ? s.inbox.find((i) => o.source.startsWith(`inbox/${i.folder}`))
    : null
  if (!mail && !item)
    return {
      tools: [
        ["Read", "deadlines.toml"],
        ["Bash", "git log -S " + o.id + " -- deadlines.toml"],
      ],
      text: L(
        lang,
        `**${o.title}** non ha un documento d'origine: l'ho messa nel registro all'inizio, dalle regole in **Catalogo**${o.notes ? `. Nota: ${o.notes}` : "."}`,
        `**${o.title}** has no source document: it went in at the start, from the rules in the **Catalog**${o.notes ? `. Note: ${o.notes}` : "."}`
      ),
    }
  const from = mail?.from ?? item?.from ?? ""
  const text = (mail?.text ?? item?.content ?? "")
    .split("\n")
    .filter(Boolean)
    .slice(0, 3)
    .join(" ")
  return {
    tools: [
      ["Read", "deadlines.toml"],
      ["Read", `${o.source}/message.md`],
    ],
    text: L(
      lang,
      `Viene da **${mail?.title ?? item?.title}**${from ? `, di ${from.replace(/<.*>/, "").trim()}` : ""}.\n\n> ${text}\n\nLa trovi in **Archivio**, o dal pulsante della fonte nella scadenza.`,
      `It comes from **${mail?.title ?? item?.title}**${from ? `, from ${from.replace(/<.*>/, "").trim()}` : ""}.\n\n> ${text}\n\nIt's in the **Archive**, or behind the source button on the deadline.`
    ),
  }
}

function aboutOne(o: Occurrence, lang: Lang): Answer {
  return aboutSteps(o, lang)
}

function fallback(lang: Lang): Answer {
  return {
    tools: [["Read", "deadlines.toml"]],
    text: L(
      lang,
      "In questa demo rispondo a un set di domande (nell'app vera Claude legge i tuoi file e risponde su tutto). Prova:\n\n- Cosa devo fare questa settimana?\n- Quanto devo pagare entro fine mese?\n- Segna pagata la rata del condominio\n- Ricordami la carta d'identità lunedì alle 9\n- Sposta il dentista a venerdì\n- Perché l'IMU è una stima?\n- L'email del rimborso è vera?\n- Quanto ho speso questo mese?\n- oppure incolla un link qualsiasi di Gmail: arriva l'avviso TARI",
      "In this demo I answer a set of questions (in the real app Claude reads your files and answers anything). Try:\n\n- What do I have to do this week?\n- How much do I have to pay by the end of the month?\n- Mark the condo fee as paid\n- Remind me about the identity card on Monday at 9\n- Move the dentist to Friday\n- Why is IMU an estimate?\n- Is the refund email real?\n- How much did I spend this month?\n- or paste any Gmail link: the TARI notice arrives"
    ),
  }
}

/** The answer for a question, and its kind (analytics only ever see the kind). */
export function route(
  text: string,
  lang: Lang,
  chatId: string,
  aboutKey?: string
): [string, Answer] {
  const t = text.toLowerCase().trim()
  const about = aboutKey
    ? (data().agenda.find((o) => o.key === aboutKey) ?? null)
    : null
  const waiting = pending.get(chatId)
  pending.delete(chatId)
  if (
    waiting &&
    /^(s[iì]|ok|va bene|confermo|certo|procedi|yes|sure|confirm|go ahead)(?![a-z])/.test(
      t
    )
  )
    return ["yes", waiting.yes()]
  if (waiting && /^(no|nope|lascia|annulla|leave|cancel)(?![a-z])/.test(t))
    return [
      "no",
      waiting.no?.() ?? {
        tools: [],
        text: L(
          lang,
          "Va bene, lascio com'è.",
          "Fine, I'll leave it as it is."
        ),
      },
    ]
  const links = gmailLinks(text)
  if (links.length) return ["gmail", gmail(links[0], lang)]
  if (
    /phish|rimborso|truffa|refund|scam|\bvera\b|\bfalsa\b|\breal\b|\bfake\b/.test(
      t
    )
  )
    return ["phish", phish(lang)]
  if (
    /puoi pagare|paga(re)? tu|pagarla tu|pagami|can you pay|pay (it )?for me/.test(
      t
    )
  )
    return ["nopay", noPay(lang)]
  if (/ricord|promemoria|avvisami|remind/.test(t))
    return ["remind", remind(text, lang, about)]
  if (/sposta|rinvia|cambia (la )?data|move|reschedule|postpone/.test(t)) {
    const a = move(text, lang, about)
    if (a) return ["move", a]
  }
  if (/segna|pagat|\bfatt[ao]\b|mark|\bpaid\b|\bdone\b/.test(t))
    return ["done", markPaid(text, lang, about)]
  if (about && /passo|step|cosa devo fare|what do i/.test(t))
    return ["about-steps", aboutSteps(about, lang)]
  if (about && /da dove|fonte|source|where does/.test(t))
    return ["about-source", aboutSource(about, lang)]
  if (/\bimu\b|stima|estimate/.test(t)) return ["imu", imu(lang)]
  if (/speso|spese|spend|spent|finanz|finance|budget/.test(t))
    return ["spending", spending(lang)]
  if (/mancan|trova|\bdate\b|missing dates|find/.test(t) && !/profil/.test(t))
    return ["find", findDates(lang)]
  if (/profil|dati|data is missing|missing/.test(t))
    return ["profile", profile(lang)]
  if (/pratic|riassum|carta|case|summar/.test(t))
    return ["case", caseSummary(lang)]
  if (/tari|rifiuti|waste/.test(t)) return ["tari", tariState(lang)]
  if (/quanto|pag|fine mese|soldi|euro|how much|pay/.test(t))
    return ["pay", pay(lang)]
  if (/settiman|oggi|domani|fare|prossim|scad|week|today|due|next/.test(t))
    return ["week", week(lang)]
  if (about) return ["about", aboutOne(about, lang)]
  return ["other", fallback(lang)]
}

// ---------- the conversation, as POST /api/chat streams it ----------

const CONFIRM_TEXT = {
  it: {
    reminder: (when: string, text: string) =>
      `⏰ Promemoria per ${when}: ${text}`,
    badTime: (at: string) =>
      `⚠️ Non ho potuto impostare il promemoria: orario non valido (${at}).`,
    inbox: (title: string) =>
      `📥 Aggiunto all'inbox: ${title}. L'agente lo archivia tra poco.`,
    changed: (summary: string, hash: string | null) =>
      `✏️ Registro aggiornato: ${summary}${hash ? ` (modifica ${hash}, annullabile da Attività)` : ""}`,
    notChanged: (why: string) => `⚠️ Modifica non applicata: ${why}`,
  },
  en: {
    reminder: (when: string, text: string) =>
      `⏰ Reminder for ${when}: ${text}`,
    badTime: (at: string) =>
      `⚠️ Could not set the reminder: invalid time (${at}).`,
    inbox: (title: string) =>
      `📥 Added to the inbox: ${title}. The agent will file it shortly.`,
    changed: (summary: string, hash: string | null) =>
      `✏️ Register updated: ${summary}${hash ? ` (change ${hash}, undo it from Activity)` : ""}`,
    notChanged: (why: string) => `⚠️ Change not applied: ${why}`,
  },
}

function when(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(TAG[lang], {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONE,
  }).format(new Date(iso))
}

/** Carries out the answer's blocks as the server does, and returns the confirmation lines. */
function finish(raw: string, lang: Lang): { text: string; lines: string[] } {
  const { text, actions } = extractActions(raw)
  const s = state()
  const t = CONFIRM_TEXT[lang]
  const lines: string[] = []
  for (const r of actions.reminders) {
    const at = reminderTime(r.at, ZONE)
    if (!at) {
      lines.push(t.badTime(r.at))
      continue
    }
    s.reminders.push({
      id: hex(8),
      at,
      text: r.text,
      created: nowIso(),
      source: "web",
      sent: null,
    })
    lines.push(t.reminder(when(at, lang), r.text))
    changed("reminders")
  }
  for (const n of actions.inbox) {
    const title = n.title || n.text.slice(0, 60)
    const id = hex(12)
    const item: DemoInbox = {
      id,
      folder: `${today()}-chat-${slug(title)}-${id.slice(0, 6)}`,
      source: "chat",
      status: "new",
      received: nowIso(),
      title,
      from: s.name,
      account: "web",
      files: [],
      ref: "",
      outcome: "",
      important: false,
      marketing: false,
      content: n.text,
    }
    s.inbox.unshift(item)
    lines.push(t.inbox(title))
    changed("inbox")
  }
  if (actions.inbox.length) queueTriage()
  for (const c of actions.changes) {
    try {
      const { hash, summary } = applyChange(c, "web")
      lines.push(t.changed(summary, hash))
    } catch (e) {
      lines.push(t.notChanged(e instanceof ChangeError ? e.message : String(e)))
    }
  }
  return { text, lines }
}

/** Words come out a few at a time, as the model streams them. */
function chunks(text: string): string[] {
  const parts = text.split(/(\s+)/)
  const out: string[] = []
  for (let i = 0; i < parts.length; i += 6)
    out.push(parts.slice(i, i + 6).join(""))
  return out
}

export type ChatRequest = {
  message: string
  chat: string | null
  view?: string
  locale?: string
  about?: string
}

export async function* answer(
  req: ChatRequest,
  signal: AbortSignal
): AsyncGenerator<ChatEvent> {
  const s = state()
  const lang: Lang = req.locale === "en" ? "en" : "it"
  let chat: Chat | undefined = req.chat
    ? s.chats.find((c) => c.id === req.chat)
    : undefined
  if (!chat) {
    chat = {
      id: hex(12),
      session: null,
      channel: "web",
      updated: nowIso(),
      messages: [],
    }
    s.chats.unshift(chat)
  }
  chat.messages.push({ role: "user", text: req.message, tools: [] })
  chat.updated = nowIso()
  changed("chats")
  yield { type: "chat", id: chat.id }

  const started = Date.now()
  const fast = reducedMotion()
  const [kind, a] = route(req.message, lang, chat.id, req.about)
  track("app_demo_ask", { question: kind })
  const message = {
    role: "assistant" as const,
    text: "",
    tools: [] as { name: string; detail: string }[],
  }
  try {
    yield { type: "session", id: `demo-${chat.id}` }
    await sleep(fast ? 150 : 650)
    for (const [name, detail] of a.tools) {
      if (signal.aborted) return
      message.tools.push({ name, detail })
      yield { type: "tool", name, detail }
      await sleep(fast ? 80 : 420 + Math.random() * 380)
    }
    if (a.tools.length) yield { type: "block" }
    await sleep(fast ? 50 : 300)
    for (const c of chunks(a.text)) {
      if (signal.aborted) return
      message.text += c
      yield { type: "text", text: c }
      await sleep(fast ? 4 : 28 + Math.random() * 30)
    }
    if (a.confirm) pending.set(chat.id, a.confirm)
    const done = finish(message.text, lang)
    message.text = [done.text, done.lines.join("\n")]
      .filter(Boolean)
      .join("\n\n")
    if (done.lines.length)
      yield { type: "text", text: `\n\n${done.lines.join("\n")}` }
    const cost = round2(0.03 + Math.random() * 0.09)
    yield { type: "end", cost, duration_ms: Date.now() - started }
    const u = s.usage
    u.runs.unshift({
      at: nowIso(),
      source: "chat",
      cost,
      duration_ms: Date.now() - started,
      input: 4100,
      output: 420,
      cache_read: 39000,
      cache_write: 1200,
      error: false,
    })
    if (u.limits) {
      u.limits.at = nowIso()
      for (const w of u.limits.windows)
        if (w.utilization !== null)
          w.utilization = Math.min(
            0.95,
            round2(w.utilization + (w.id === "five_hour" ? 0.01 : 0.002))
          )
    }
    changed("usage")
  } finally {
    chat.messages.push(message)
    chat.updated = nowIso()
    changed("chats")
  }
}

/** GET /api/gmail/preview: any Gmail link opens the demo's TARI notice. */
export function preview(link: string) {
  const found = gmailLinks(link)[0]
  if (!found) return null
  const s = state()
  const Y = year()
  const mail = s.emails.find((e) =>
    e.title.startsWith(`Avviso di pagamento TARI ${Y}`)
  )
  return {
    account: ACCOUNT,
    thread: threadOf(found),
    subject: `Avviso di pagamento TARI ${Y}`,
    from: "Comune di Esempio, Ufficio Tributi <tributi@pec.comune.example>",
    date: mail?.date ?? nowIso(),
    snippet: `In allegato l'avviso TARI ${Y} per l'immobile di via Roma 12: 287,00 € in due rate.`,
    messages: 1,
    attachments: [`avviso-tari-${Y}.pdf`],
    folders: mail ? [mail.path] : [],
    link: found,
  }
}
