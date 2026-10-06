// "Chiedi a Claude" in the demo: the same panel as apps/web/src/components/chat.tsx, with scripted answers
// that read the demo's register. Steps (the tools Claude runs), a streamed answer, the server's
// confirmation cards, yes/no when a change needs your word, and Gmail links as preview cards.
import { track } from "../analytics.ts"
import { svg } from "../icons.ts"
import { addDays, endOfMonth, eur, fmtDay, fmtWeekday, iso, relative } from "../time.ts"
import { M, daysLeft, esc, s, wait, type Ctx } from "./core.ts"
import { D, PERSON, T0, YEAR, type Deadline } from "./data.ts"

export const Q = {
  week: "Cosa devo fare questa settimana?",
  pay: "Quanto devo pagare entro fine mese?",
  case: "Riassumi la pratica più urgente",
  profile: "Quali dati mancano nel profilo?",
  done: "Segna pagata la rata del condominio",
  remind: "Ricordami la carta d'identità lunedì",
  imu: "Perché l'IMU è una stima?",
  nopay: "Puoi pagare tu la TARI?",
  find: "Trova le date che mancano",
  phish: "L'email del rimborso è vera?",
}
/** The real app's empty-state suggestions. */
const STARTERS = [Q.week, Q.pay, Q.case, Q.profile]
const FOLLOW = [Q.week, Q.pay, Q.done, Q.remind, Q.imu, Q.case, Q.nopay, Q.profile]

export const GMAIL_LINK = "https://mail.google.com/mail/u/0/#inbox/FMfcgzQbdTnVcxKpWw"
export const TARI_Q = "Mi è arrivata questa dal Comune, la segni tu?"

const TOOLS: Record<string, [label: string, icon: string]> = {
  Read: ["Legge", "file-text"],
  Edit: ["Modifica", "file-pen"],
  Glob: ["Cerca file", "search"],
  Grep: ["Cerca", "search"],
  WebSearch: ["Cerca sul web", "globe"],
  WebFetch: ["Apre", "globe"],
  Bash: ["Esegue", "terminal"],
  Gmail: ["Scarica da Gmail", "mail"],
}

type Step = [tool: keyof typeof TOOLS, detail: string]
interface Conf {
  kind: "change" | "reminder" | "inbox" | "warning"
  label: string
  body: string
  hash?: string
}
interface Answer {
  steps: Step[]
  html: string
  confirm?: { yes: () => Answer; no?: () => Answer }
  /** Runs once the text is out: the change itself, and the server's confirmation lines. */
  after?: () => Conf[] | void
}

const CONF_ICON = { change: "file-pen", reminder: "bell", inbox: "inbox", warning: "triangle-alert" }

function gmailCard(state: "loading" | "ready", hint = "") {
  if (state === "loading")
    return `<div class="x-gm is-loading" aria-busy="true"><span class="x-gm__ic">${svg("mail")}</span><span class="x-gm__main"><span class="shiny">Apro il link di Gmail…</span><i class="x-skel" style="width:78%"></i><i class="x-skel" style="width:52%"></i></span></div>`
  return `<div class="x-gm rise"><span class="x-gm__ic">${svg("mail")}</span><span class="x-gm__main">
    <span class="x-gm__label">Gmail · 1 messaggio</span>
    <b>Avviso di pagamento TARI ${YEAR}</b>
    <span class="x-gm__from">Comune di Esempio · <span class="s">tributi@pec.comune.esempio.it</span></span>
    <span class="x-gm__att">${svg("paperclip")}1 allegato · avviso-tari-${YEAR}.pdf</span>
    ${hint ? `<span class="x-gm__hint">${hint}</span>` : ""}
  </span>${hint ? "" : svg("chevron-down", "x-gm__chev")}</div>`
}

export interface ChatApi {
  el: HTMLElement
  ask(text: string, opts?: { gmail?: boolean; answer?: Answer; quiet?: boolean }): Promise<void>
  typeDraft(text: string, link?: string): Promise<void>
  /** Sends the draft; `quiet` when the guided story sends it (not a visitor's question). */
  send(quiet?: boolean): Promise<void>
  yesButton(): HTMLButtonElement | null
  /** Answers the pending yes/no question, and resolves when Claude is done. */
  confirm(yes: boolean): Promise<void>
  reset(): void
  busy(): boolean
  focus(): void
}

export function createChat(ctx: Ctx): ChatApi {
  const { S } = ctx
  const el = document.createElement("aside")
  el.className = "x-chat"
  el.setAttribute("aria-label", "Chiedi a Claude")
  el.innerHTML = `
    <header class="x-chat__head">
      <span class="x-mark">${svg("sparkles")}</span>
      <span class="x-chat__name"><b>Chiedi a Claude</b><small>Claude Code · sola lettura</small></span>
      <button type="button" class="x-ib x-ib--ghost" data-chat="history" aria-label="Cronologia chat" aria-pressed="false">${svg("messages-square")}</button>
      <button type="button" class="x-ib x-ib--ghost" data-chat="new" aria-label="Nuova chat">${svg("square-pen")}</button>
      <button type="button" class="x-ib x-ib--ghost" data-act="chat" aria-label="Chiudi la chat">${svg("x")}</button>
    </header>
    <div class="x-chat__body">
      <div class="x-chat__empty">
        <p class="x-chat__title rise">Cosa vuoi sapere?</p>
        <p class="x-chat__lead rise">Claude legge scadenze, pratiche, profilo e catalogo sul tuo server e risponde. La conversazione è condivisa tra i tuoi dispositivi.</p>
        <div class="x-chat__starters">${STARTERS.map((q, i) => `<button type="button" class="x-starter rise" style="--i:${i + 1}" data-q="${q}">${q}</button>`).join("")}</div>
      </div>
      <div class="x-history" hidden>
        <p class="x-history__title">Chat precedenti</p>
        <ul>
          <li aria-current="true"><b>Questa conversazione</b><small>oggi · attuale</small></li>
          <li><b>Quando scade la revisione della Panda?</b><small>2 ott, 21:20</small></li>
          <li><b>Cosa serve per rinnovare la carta d'identità?</b><small>30 set, 08:05</small></li>
        </ul>
      </div>
      <div class="x-thread" aria-live="polite"></div>
    </div>
    <form class="x-chat__form">
      <div class="x-chat__draft"></div>
      <div class="x-chat__suggest" hidden></div>
      <div class="x-chat__input">
        <label class="sr-only" for="x-chat-input">Domanda per Claude</label>
        <textarea id="x-chat-input" rows="1" placeholder="Scrivi una domanda…" enterkeyhint="send"></textarea>
        <button type="submit" class="x-send" aria-label="Invia" disabled>${svg("arrow-up")}</button>
      </div>
      <p class="x-chat__hint">Invio per mandare, Maiusc+Invio per andare a capo.</p>
    </form>`

  const body = el.querySelector<HTMLElement>(".x-chat__body")!
  const empty = el.querySelector<HTMLElement>(".x-chat__empty")!
  const history = el.querySelector<HTMLElement>(".x-history")!
  const thread = el.querySelector<HTMLElement>(".x-thread")!
  const draft = el.querySelector<HTMLElement>(".x-chat__draft")!
  const suggest = el.querySelector<HTMLElement>(".x-chat__suggest")!
  const input = el.querySelector<HTMLTextAreaElement>("textarea")!
  const sendBtn = el.querySelector<HTMLButtonElement>(".x-send")!
  const form = el.querySelector<HTMLFormElement>("form")!

  let busy = false
  let pending: Answer["confirm"] | null = null
  let draftGmail = false
  const asked = new Set<string>()
  let session = 0 // bumps on "new chat", so a streaming answer stops writing

  const scroll = () => body.scrollTo({ top: body.scrollHeight, behavior: M.instant ? "auto" : "smooth" })

  // ---------- answers ----------
  const find = (id: string) => S.deadlines.find((d) => d.id === id)
  const open = (d: Deadline) => d.date && !d.done

  function tari(): Answer {
    if (S.deadlines.some((d) => d.id === "tari1"))
      return {
        steps: [["Read", "deadlines.toml"]],
        html: `<p>L'avviso TARI ${YEAR} è già nel registro: due rate da ${s(eur(143.5))}, il ${fmtDay(D.tari1)} e il ${fmtDay(D.tari2)}.</p>`,
      }
    const reminder = addDays(D.tari1, -7)
    return {
      steps: [
        ["Gmail", "FMfcgzQbdTnVcxKpWw"],
        ["Read", `archive/email/${iso(T0)}-avviso-tari/avviso-tari-${YEAR}.pdf`],
        ["Read", "deadlines.toml"],
        ["Read", "catalog/tari.md"],
      ],
      html: `<p>È l'avviso <b>TARI ${YEAR}</b> del Comune di Esempio, intestato a ${s(PERSON.name)}: ${s(eur(287))} in due rate.</p>
        <ul><li>prima rata, ${s(eur(143.5))} entro il <b>${fmtDay(D.tari1)}</b></li><li>seconda rata, ${s(eur(143.5))} entro il <b>${fmtDay(D.tari2)}</b></li></ul>
        <p>Il mittente è la PEC del Comune che hai nel profilo. Aggiungo le due rate al registro, al posto della TARI senza data?</p>`,
      confirm: {
        yes: () => ({
          steps: [["Edit", "deadlines.toml"]],
          html: `<p>Fatto: due rate in <b>Casa</b>, con promemoria su Telegram 7 e 3 giorni prima. Il pagamento lo fai tu, con il modulo allegato all'avviso.</p>`,
          after: () => {
            const removed = S.deadlines.filter((d) => d.id === "tari")
            S.deadlines = S.deadlines.filter((d) => d.id !== "tari")
            S.deadlines.push(
              { id: "tari1", title: `TARI ${YEAR}, prima rata`, area: "Casa", severity: "medium", date: D.tari1, amount: 143.5 },
              { id: "tari2", title: `TARI ${YEAR}, seconda rata`, area: "Casa", severity: "medium", date: D.tari2, amount: 143.5 },
            )
            S.inbox.unshift({ id: "tari-mail", icon: "mail", title: `Avviso di pagamento TARI ${YEAR}`, meta: "Gmail · Comune di Esempio", when: "oggi", status: "filed" })
            S.reminders++
            const hash = ctx.commit(
              `Chat: TARI ${YEAR}, due rate dall'avviso del Comune`,
              ["deadlines.toml", `archive/email/${iso(T0)}-avviso-tari/message.md`],
              [`<span class="file">deadlines.toml</span>`, ...[`[[deadline]]`, `id = "tari-${YEAR}-1"`, `area = "home"`, `date = ${iso(D.tari1)}`, `amount = <span class="s">143.50</span>`, `<span class="file">… e la seconda rata, ${iso(D.tari2)}</span>`].map((l) => `<span class="add">+ ${l}</span>`)].join("\n"),
              () => {
                S.deadlines = S.deadlines.filter((d) => d.id !== "tari1" && d.id !== "tari2")
                S.deadlines.push(...removed)
              },
            )
            ctx.changed(["tari1", "tari2", "tari-mail", hash], true)
            return [
              { kind: "change", label: "Registro aggiornato", body: `TARI ${YEAR}, prima e seconda rata`, hash },
              { kind: "reminder", label: `Promemoria per ${fmtWeekday(reminder).toLowerCase()} ${fmtDay(reminder)}, 08:30`, body: `TARI ${YEAR}, prima rata` },
            ]
          },
        }),
        no: () => ({ steps: [], html: `<p>Va bene, la lascio com'è. Il link resta nella conversazione se cambi idea.</p>` }),
      },
    }
  }

  function week(): Answer {
    const list = S.deadlines.filter((d) => open(d) && daysLeft(d) <= 7).sort((a, b) => daysLeft(a) - daysLeft(b))
    const after = S.deadlines.filter((d) => open(d) && daysLeft(d) > 7).sort((a, b) => daysLeft(a) - daysLeft(b))[0]
    const li = (d: Deadline) =>
      `<li><b>${d.title}</b>, ${fmtWeekday(d.date!).toLowerCase()} ${fmtDay(d.date!)} (${relative(daysLeft(d))})${d.amount ? ` · ${s(eur(d.amount))}` : ""}</li>`
    return {
      steps: [
        ["Bash", "python3 scripts/when.py"],
        ["Read", "deadlines.toml"],
        ["Read", "state.json"],
      ],
      html: list.length
        ? `<p>Questa settimana ${list.length === 1 ? "hai una cosa" : `hai ${list.length} cose`}:</p><ul>${list.map(li).join("")}</ul>${
            list.some((d) => d.id === "carta") ? `<p>Per la carta d'identità la foto tessera è già nella pratica: manca solo l'appuntamento in Comune.</p>` : ""
          }${after ? `<p>Subito dopo: <b>${after.title}</b>, ${fmtDay(after.date!)}.</p>` : ""}`
        : `<p>Niente in scadenza nei prossimi 7 giorni.${after ? ` La prossima è <b>${after.title}</b>, ${fmtDay(after.date!)}.` : ""}</p>`,
    }
  }

  function pay(): Answer {
    const end = endOfMonth(T0)
    const items = S.deadlines.filter((d) => open(d) && d.amount != null && d.date! <= end).sort((a, b) => daysLeft(a) - daysLeft(b))
    const total = items.reduce((a, d) => a + d.amount!, 0)
    const est = items.some((d) => d.estimate)
    return {
      steps: [
        ["Read", "deadlines.toml"],
        ["Read", "state.json"],
        ["Read", "finance/summary.md"],
      ],
      html: items.length
        ? `<p>Entro il ${fmtDay(end)} paghi ${est ? "circa " : ""}<b>${s(eur(total))}</b>:</p><ul>${items
            .map((d) => `<li><b>${d.title}</b>, ${fmtDay(d.date!)} · ${d.estimate ? "≈ " : ""}${s(eur(d.amount!))}</li>`)
            .join("")}</ul>${est ? `<p>Le voci con ≈ sono stime: la media di quanto hai pagato l'ultimo anno.</p>` : ""}`
        : `<p>Entro il ${fmtDay(end)} non hai pagamenti in sospeso.</p>`,
    }
  }

  function caseSummary(): Answer {
    const expires = addDays(T0, 129)
    return {
      steps: [
        ["Glob", "cases/*/README.md"],
        ["Read", `cases/${YEAR}-carta-identita/README.md`],
        ["Read", "profile.toml"],
      ],
      html: `<h4>Rinnovo carta d'identità</h4>
        <p><b>Stato:</b> da prenotare. La carta attuale scade il ${s(fmtDay(expires))}, in registro la prenotazione è per il ${fmtDay(D.carta)}.</p>
        <ul class="x-check"><li class="is-ok">Foto tessera, arrivata il 30 settembre</li><li>Prenotare l'appuntamento in Comune</li><li>Portare la carta vecchia e la tessera sanitaria</li><li>Pagare circa ${s("22 €")} allo sportello</li></ul>`,
    }
  }

  function profile(): Answer {
    return {
      steps: [
        ["Read", "profile.toml"],
        ["Grep", '"TODO"'],
      ],
      html: `<p>Mancano quattro dati:</p><ul><li><b>Codice fiscale</b>, per controllare gli F24.</li><li><b>Scadenza del passaporto</b>: senza, non posso avvisarti.</li><li><b>Datore di lavoro</b>, per capire se l'acconto IRPEF passa dalla busta paga.</li><li><b>Classe ambientale della Panda</b>, per stimare il bollo.</li></ul><p>Scrivimeli qui o mandami una foto dei documenti.</p>`,
    }
  }

  function markPaid(): Answer {
    const d = find("condominio")!
    if (d.done) return { steps: [["Read", "state.json"]], html: `<p>La rata del ${fmtDay(d.date!)} risulta già pagata.</p>` }
    return {
      steps: [
        ["Read", "deadlines.toml"],
        ["Read", "state.json"],
      ],
      html: `<p>La prossima <b>Rata condominio</b> è del ${fmtDay(d.date!)}, ${s(eur(180))}. La segno come pagata?</p>`,
      confirm: {
        yes: () => ({
          steps: [["Edit", "state.json"]],
          html: `<p>Segnata. La rata successiva resta in calendario, e la spesa va nell'app Finance come <b>Casa</b>.</p>`,
          after: () => {
            ctx.setDone("condominio", true)
            return [{ kind: "change", label: "Registro aggiornato", body: "Rata condominio segnata come pagata", hash: S.commits[0].hash }]
          },
        }),
      },
    }
  }

  function remind(): Answer {
    const monday = addDays(T0, (8 - T0.getDay()) % 7 || 7)
    return {
      steps: [["Bash", "python3 scripts/when.py lunedì 09:00"]],
      html: `<p>Ti scrivo su Telegram ${fmtWeekday(monday).toLowerCase()} ${fmtDay(monday)} alle 9:00: «Prenotare la carta d'identità».</p>`,
      after: () => {
        S.reminders++
        return [{ kind: "reminder", label: `Promemoria per ${fmtWeekday(monday).toLowerCase()} ${fmtDay(monday)}, 09:00`, body: "Prenotare la carta d'identità" }]
      },
    }
  }

  function imu(): Answer {
    return {
      steps: [
        ["Read", "deadlines.toml"],
        ["Read", "catalog/imu.md"],
        ["WebSearch", "IMU saldo 16 dicembre aliquote"],
        ["WebFetch", "finanze.gov.it"],
      ],
      html: `<p>L'IMU del box auto non arriva a casa: si calcola da sé. Ho stimato ${s(eur(405))} dalla rata di giugno.</p>
        <p><span class="x-ver">Verificato</span> Il saldo si paga entro il <b>16 dicembre</b>, con F24. Fonte: Dipartimento delle Finanze, controllata oggi.</p>
        <p><span class="x-ded">Dedotto</span> L'importo: se il Comune non cambia le aliquote, il saldo è uguale all'acconto. Lo ricontrollo quando pubblica la delibera.</p>`,
    }
  }

  function noPay(): Answer {
    const t = find("tari1")
    return {
      steps: [["Read", "deadlines.toml"]],
      html: `<p>No: non pago mai al posto tuo, non firmo e non scrivo agli enti. Ti preparo importo, scadenza e riferimenti, poi paghi tu.</p>${
        t ? `<p>Per la prima rata: ${s(eur(143.5))} entro il ${fmtDay(t.date!)}, con il modulo allegato all'avviso. Quando hai pagato, premi «Fatto» su Telegram.</p>` : ""
      }`,
    }
  }

  function findDates(): Answer {
    const tariMissing = S.deadlines.some((d) => d.id === "tari")
    return {
      steps: [
        ["Read", "deadlines.toml"],
        ["Grep", 'date = "TODO"'],
      ],
      html: `<p>${tariMissing ? "Ne mancano due" : "Ne manca una"}:</p><ul>${
        tariMissing ? `<li><b>TARI</b>: le date arrivano con l'avviso del Comune. Incollami il link dell'email di Gmail e le leggo.</li>` : ""
      }<li><b>Scadenza passaporto</b>: è scritta sul documento. Mandami una foto e la aggiungo.</li></ul>`,
    }
  }

  function phish(): Answer {
    if (S.arrived.has("phishing"))
      return {
        steps: [["Read", "inbox/…-rimborso/content.md"]],
        html: `<p>No. L'ho segnalata come possibile phishing: il dominio è <code>agenzia-entrate-servizi.info</code>, non <code>agenziaentrate.gov.it</code>, e chiede i dati della carta.</p><p>Non aprire i link: i rimborsi veri si controllano nell'area riservata del sito dell'Agenzia.</p>`,
      }
    return {
      steps: [["Glob", "inbox/*/item.json"]],
      html: `<p>Non la trovo nell'inbox. Mandamela: la prima cosa che guardo è il dominio del mittente. In <b>Inbox → Simula un arrivo</b> ce n'è una di esempio.</p>`,
    }
  }

  function fallback(): Answer {
    return {
      steps: [["Read", "deadlines.toml"]],
      html: `<p>In questa demo rispondo a poche domande. Nell'app vera Claude legge i tuoi file e risponde su tutto quello che c'è nel registro.</p><p>Prova una di quelle qui sotto.</p>`,
    }
  }

  /** The answer, and its category for analytics (what people type never leaves the page). */
  function route(text: string, gmail: boolean): [string, Answer] {
    const t = text.toLowerCase()
    if (pending && /^(s[iì]|ok|va bene|confermo|certo)\b/.test(t)) return ["yes", pending.yes()]
    if (pending && /^no\b/.test(t)) return ["no", pending.no?.() ?? { steps: [], html: `<p>Va bene, la lascio com'è.</p>` }]
    if (gmail || /mail\.google\.com/.test(t)) return ["gmail", tari()]
    if (/phish|rimborso|truffa|vera\b|falsa/.test(t)) return ["phish", phish()]
    if (/puoi pagare|paga(re)? tu|pagarla tu|pagami/.test(t)) return ["nopay", noPay()]
    if (/ricord|promemoria|avvisami/.test(t)) return ["remind", remind()]
    if (/segna|pagat|fatt[ao]\b/.test(t)) return ["done", markPaid()]
    if (/imu|stima/.test(t)) return ["imu", imu()]
    if (/mancan|trova|date/.test(t) && !/profilo/.test(t)) return ["find", findDates()]
    if (/profilo|dati/.test(t)) return ["profile", profile()]
    if (/pratica|riassum|carta/.test(t)) return ["case", caseSummary()]
    if (/tari|rifiuti/.test(t)) return ["tari", S.deadlines.some((d) => d.id === "tari1") ? tari() : findDates()]
    if (/quanto|pag|fine mese|soldi|euro|spend/.test(t)) return ["pay", pay()]
    if (/settiman|oggi|domani|fare|prossim|scad/.test(t)) return ["week", week()]
    return ["other", fallback()]
  }

  // ---------- rendering ----------
  function setDraftCard(state: "none" | "loading" | "ready") {
    draft.innerHTML = state === "none" ? "" : gmailCard(state, "Claude la legge quando invii")
  }

  let linkTimer = 0
  function onDraft() {
    const text = input.value
    sendBtn.disabled = !text.trim() || busy
    const has = /mail\.google\.com/.test(text)
    clearTimeout(linkTimer)
    if (!has) {
      draftGmail = false
      setDraftCard("none")
      return
    }
    if (draftGmail) return
    linkTimer = window.setTimeout(async () => {
      draftGmail = true
      setDraftCard("loading")
      await wait(750)
      if (draftGmail) setDraftCard("ready")
    }, M.instant ? 0 : 350)
  }

  function showSuggestions() {
    const next = FOLLOW.filter((q) => !asked.has(q)).slice(0, 3)
    suggest.hidden = !thread.childElementCount || busy || !next.length
    suggest.innerHTML = `<span>Prova</span>${next.map((q) => `<button type="button" class="x-sug" data-q="${q}">${q}</button>`).join("")}`
  }

  /** Words come in one after the other, as the stream does; the caret follows the last one. */
  function stream(root: HTMLElement): number {
    let i = 0
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    while (walker.nextNode()) nodes.push(walker.currentNode as Text)
    for (const node of nodes) {
      if (node.parentElement?.closest(".s, code")) continue
      const frag = document.createDocumentFragment()
      for (const part of node.data.split(/(\s+)/)) {
        if (!part) continue
        if (/^\s+$/.test(part)) {
          frag.append(part)
          continue
        }
        const w = document.createElement("span")
        w.className = "w"
        w.style.setProperty("--i", String(i++))
        w.textContent = part
        frag.append(w)
      }
      node.replaceWith(frag)
    }
    return i
  }

  async function ask(text: string, opts: { gmail?: boolean; answer?: Answer; quiet?: boolean } = {}) {
    if (busy) return
    busy = true
    const me = session
    asked.add(text)
    empty.hidden = true
    history.hidden = true
    el.querySelector('[data-chat="history"]')!.setAttribute("aria-pressed", "false")
    suggest.hidden = true
    sendBtn.disabled = true
    thread.querySelector(".x-yesno")?.remove()
    let answer = opts.answer
    if (!answer) {
      const [kind, a] = route(text, !!opts.gmail)
      answer = a
      if (!opts.quiet) track("demo_ask", { question: kind, via: Object.values(Q).includes(text) ? "suggestion" : "typed" })
    }
    pending = null

    const q = document.createElement("div")
    q.className = "x-q"
    const words = text.replace(GMAIL_LINK, "").trim()
    q.innerHTML = `${words ? `<div class="x-q__bubble">${esc(words)}</div>` : ""}${opts.gmail ? gmailCard("ready") : ""}`
    thread.append(q)

    const a = document.createElement("div")
    a.className = "x-a"
    a.innerHTML = `<ul class="x-steps"></ul><p class="x-thinking-row"><span class="x-thinking" aria-hidden="true"><i></i><i></i><i></i></span><span class="shiny">Sto guardando i file…</span></p>`
    thread.append(a)
    scroll()
    const steps = a.querySelector<HTMLElement>(".x-steps")!
    const started = performance.now()

    for (const [tool, detail] of answer.steps) {
      await wait(560)
      if (me !== session) return
      const [label, icon] = TOOLS[tool]
      const li = document.createElement("li")
      li.innerHTML = `${svg(icon)}<span>${label}</span><code>${detail}</code>`
      steps.append(li)
      // while running, only the last three steps show
      ;[...steps.children].slice(0, -3).forEach((n) => n.classList.add("is-gone"))
      scroll()
    }
    await wait(answer.steps.length ? 520 : 700)
    if (me !== session) return
    a.querySelector(".x-thinking-row")?.remove()

    const out = document.createElement("div")
    out.className = `x-a__text${M.instant ? " is-instant" : " streaming"}`
    out.innerHTML = answer.html
    const n = stream(out)
    a.append(out)
    scroll()
    await wait(Math.min(2600, n * 22 + 260))
    if (me !== session) return
    out.classList.remove("streaming")

    if (answer.steps.length) {
      const all = [...steps.children].map((li) => `<li>${li.innerHTML}</li>`).join("")
      steps.outerHTML = `<details class="x-steps-done"><summary>${answer.steps.length === 1 ? "1 passaggio" : `${answer.steps.length} passaggi`}<span> · mostra</span></summary><ul class="x-steps">${all}</ul></details>`
    }

    const confs = answer.after?.() ?? []
    if (confs.length) {
      const box = document.createElement("div")
      box.className = "x-confs"
      box.innerHTML = confs
        .map(
          (c, i) =>
            `<button type="button" class="x-cc is-${c.kind} rise" style="--i:${i}" data-conf="${c.kind}"${c.hash ? ` data-hash="${c.hash}"` : ""}>
              <span class="x-cc__ic">${svg(CONF_ICON[c.kind])}</span>
              <span class="x-cc__main"><span class="x-cc__label">${c.label}</span><span class="x-cc__body">${c.body}</span></span>
              <span class="x-cc__go">${c.hash ? `<span class="mono">${c.hash}</span>` : ""}${svg("chevron-right")}</span>
            </button>`,
        )
        .join("")
      a.append(box)
    }
    const secs = Math.max(1, Math.round((performance.now() - started) / 1000))
    a.insertAdjacentHTML("beforeend", `<p class="x-a__meta">${M.instant ? Math.max(3, answer.steps.length + 2) : secs} s</p>`)

    if (answer.confirm) {
      pending = answer.confirm
      const yn = document.createElement("div")
      yn.className = "x-yesno rise"
      yn.innerHTML = `<button type="button" class="x-btn x-btn--dark x-btn--sm" data-yes>${svg("check")}Sì</button><button type="button" class="x-btn x-btn--soft x-btn--sm" data-no>${svg("x")}No</button>`
      thread.append(yn)
    }
    busy = false
    sendBtn.disabled = !input.value.trim()
    showSuggestions()
    scroll()
  }

  async function typeDraft(text: string, link?: string) {
    input.focus({ preventScroll: true })
    for (const ch of text) {
      if (M.instant) break
      input.value += ch
      onDraft()
      await wait(ch === " " ? 70 : 34)
    }
    input.value = text + (link ? ` ${link}` : "")
    onDraft()
    if (link) await wait(1300)
  }

  async function sendDraft(quiet = false) {
    const text = input.value.trim()
    if (!text || busy) return
    const gmail = /mail\.google\.com/.test(text)
    input.value = ""
    draftGmail = false
    setDraftCard("none")
    onDraft()
    await ask(text, { gmail, quiet })
  }

  function reset() {
    session++
    busy = false
    pending = null
    thread.innerHTML = ""
    asked.clear()
    empty.hidden = false
    history.hidden = true
    suggest.hidden = true
    input.value = ""
    draftGmail = false
    setDraftCard("none")
    onDraft()
  }

  // ---------- wiring ----------
  input.addEventListener("input", onDraft)
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      void sendDraft()
    }
    e.stopPropagation() // typing here never triggers the demo's shortcuts
  })
  form.addEventListener("submit", (e) => {
    e.preventDefault()
    void sendDraft()
  })
  function confirm(yes: boolean): Promise<void> {
    if (!pending) return Promise.resolve()
    if (yes) return ask("Sì, confermo", { answer: pending.yes() })
    return ask("No, lascia com'è", { answer: pending.no?.() ?? { steps: [], html: `<p>Va bene, la lascio com'è.</p>` } })
  }

  el.addEventListener("click", (e) => {
    const t = e.target as HTMLElement
    const q = t.closest<HTMLElement>("[data-q]")
    if (q) return void ask(q.dataset.q!)
    if (t.closest("[data-yes]")) return void confirm(true)
    if (t.closest("[data-no]")) return void confirm(false)
    const conf = t.closest<HTMLElement>("[data-conf]")
    if (conf) {
      const kind = conf.dataset.conf
      if (kind === "change") ctx.go("activity", conf.dataset.hash)
      else if (kind === "inbox") ctx.go("inbox")
      else if (kind === "reminder")
        ctx.toast({ icon: "bell", title: "Promemoria impostato", body: "Nell'app li trovi in Impostazioni, e arrivano su Telegram all'ora giusta." })
      return
    }
    if (t.closest('[data-chat="new"]')) return reset()
    const h = t.closest<HTMLElement>('[data-chat="history"]')
    if (h) {
      const on = history.hidden
      history.hidden = !on
      h.setAttribute("aria-pressed", String(on))
      empty.hidden = on || thread.childElementCount > 0
      thread.hidden = on
    }
  })

  return {
    el,
    ask,
    typeDraft,
    send: sendDraft,
    yesButton: () => thread.querySelector<HTMLButtonElement>("[data-yes]"),
    confirm,
    reset,
    busy: () => busy,
    focus: () => input.focus({ preventScroll: true }),
  }
}
