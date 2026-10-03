// The interactive demo: a made-up register (Maria Rossi) that files documents, colours deadlines,
// sends Telegram reminders and answers a few questions. Everything is scripted and runs in the page.
import { addDays, daysBetween, fmtFull, fmtLong, fmtShort, iso, level, reducedMotion, relative, today, type Severity } from "./time.ts"
import { renderIcons, swapIcon } from "./icons.ts"

type DocId = "tari" | "multa" | "phishing" | "bollo"

interface Chip {
  id: string
  name: string
  date: Date
  severity: Severity
  area: string
  done?: boolean
  fresh?: boolean
}

interface Line {
  icon: string
  html: string
  kind?: "warn" | "ok"
}

interface Script {
  lines: Line[]
  diff?: string
  commit: string
  chips: Chip[]
  message: { html: string; warn?: boolean; doneFor?: string }
  tag: string
}

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!

const T0 = today()
const s = (text: string) => `<span class="s">${text}</span>`
const r = (text: string) => `<span class="redact">${text}</span>`
const code = (text: string) => `<code>${text}</code>`

/** The last day of this month, or of the next one when this one is about to end. */
function endOfMonth(): Date {
  let d = new Date(T0.getFullYear(), T0.getMonth() + 1, 0)
  if (daysBetween(T0, d) < 6) d = new Date(T0.getFullYear(), T0.getMonth() + 2, 0)
  return d
}

const D = {
  tari1: addDays(T0, 13),
  tari2: addDays(T0, 74),
  fine5: addDays(T0, 5),
  fine60: addDays(T0, 60),
  bollo: endOfMonth(),
}
const year = T0.getFullYear()

const BASE: Chip[] = [
  { id: "condominio", name: "Rata condominio", date: addDays(T0, 12), severity: "medium", area: "Casa" },
  { id: "gomme", name: "Gomme invernali", date: addDays(T0, 42), severity: "low", area: "Veicoli" },
  { id: "revisione", name: "Revisione auto", date: addDays(T0, 58), severity: "medium", area: "Veicoli" },
]

function toml(lines: string[]): string {
  return [`<span class="file">deadlines.toml</span>`, ...lines.map((l) => `<span class="add">+ ${l}</span>`)].join("\n")
}

const SCRIPTS: Record<DocId, Script> = {
  tari: {
    lines: [
      { icon: "file-text", html: `Leggo ${code("avviso-tari-" + year + ".pdf")}, 2 pagine` },
      { icon: "shield-check", html: `PEC del Comune, mittente già noto nel profilo`, kind: "ok" },
      { icon: "search", html: `Intestataria: ${s("Maria Rossi")}, ${s("via Roma 12")}` },
      { icon: "receipt", html: `Totale ${s("€ 287,00")} in due rate: ${fmtShort(D.tari1)} e ${fmtShort(D.tari2)}` },
    ],
    diff: toml([
      `[[deadline]]`,
      `id = "tari-${year}-1"`,
      `title = "TARI ${year}, prima rata"`,
      `area = "home"`,
      `severity = "medium"`,
      `date = ${iso(D.tari1)}`,
      `amount = <span class="s">143.50</span>`,
      `case = "${year}-tari"`,
      `<span class="file">… e la seconda rata, ${iso(D.tari2)}</span>`,
    ]),
    commit: `TARI ${year}: due rate dall'avviso`,
    chips: [
      { id: "tari1", name: `TARI ${year}, prima rata`, date: D.tari1, severity: "medium", area: "Casa" },
      { id: "tari2", name: `TARI ${year}, seconda rata`, date: D.tari2, severity: "medium", area: "Casa" },
    ],
    message: {
      html: `<b>TARI ${year}, prima rata</b> tra 13 giorni, ${r("€ 143,50")}. Ti riscrivo a 7 e a 3 giorni.`,
      doneFor: "tari1",
    },
    tag: "Archiviato",
  },
  multa: {
    lines: [
      { icon: "image", html: `Foto HEIC: creo una copia JPEG e leggo il verbale` },
      { icon: "search", html: `Verbale n. ${s("2026/0004471")}, Polizia Locale, accesso in ZTL` },
      { icon: "car", html: `Targa ${s("AB123CD")}: è la ${s("Fiat Panda")} del profilo` },
      { icon: "calendar", html: `Notificato oggi. Ridotto del 30% entro 5 giorni: ${s("€ 58,10")}` },
      { icon: "calendar", html: `Altrimenti ${s("€ 83,00")} entro 60 giorni` },
    ],
    diff: toml([
      `[[deadline]]`,
      `id = "multa-ztl-ridotta"`,
      `title = "Multa ZTL, pagamento ridotto"`,
      `area = "vehicles"`,
      `severity = "high"`,
      `date = ${iso(D.fine5)}`,
      `amount = <span class="s">58.10</span>`,
      `<span class="file">… e l'importo pieno, ${iso(D.fine60)}</span>`,
    ]),
    commit: "Multa ZTL: pagamento ridotto entro 5 giorni",
    chips: [
      { id: "multa5", name: "Multa ZTL, pagamento ridotto", date: D.fine5, severity: "high", area: "Veicoli" },
      { id: "multa60", name: "Multa ZTL, importo pieno", date: D.fine60, severity: "high", area: "Veicoli" },
    ],
    message: {
      html: `<b>Multa ZTL</b>: pagamento ridotto entro 5 giorni, ${r("€ 58,10")}. Ti preparo i dati del verbale, paghi tu.`,
      doneFor: "multa5",
    },
    tag: "Archiviato",
  },
  phishing: {
    lines: [
      { icon: "mail", html: `Leggo l'email da ${code("rimborsi@agenzia-entrate-servizi.info")}` },
      { icon: "triangle-alert", html: `Il dominio non è quello dell'Agenzia delle Entrate (${code("agenziaentrate.gov.it")})`, kind: "warn" },
      { icon: "triangle-alert", html: `Chiede i dati della carta per «sbloccare il rimborso»`, kind: "warn" },
      { icon: "lock", html: `Non apro i due link.` },
      { icon: "shield-alert", html: `Possibile phishing. Nessuna scadenza aggiunta.`, kind: "warn" },
    ],
    commit: "Inbox: email segnalata come possibile phishing",
    chips: [],
    message: {
      html: `<b>Possibile phishing</b> nell'inbox: un falso rimborso dell'Agenzia delle Entrate. Non aprire i link e non pagare.`,
      warn: true,
    },
    tag: "Segnalato",
  },
  bollo: {
    lines: [
      { icon: "mic", html: `Trascrivo la nota vocale sul server: «Il bollo della Panda scade a fine mese»` },
      { icon: "car", html: `Veicolo nel profilo: ${s("Fiat Panda")}, targa ${s("AB123CD")}` },
      { icon: "calendar", html: `Scade il ${fmtShort(D.bollo)}, ogni anno. Promemoria a 7 e a 3 giorni` },
    ],
    diff: toml([
      `[[deadline]]`,
      `id = "bollo-auto"`,
      `title = "Bollo auto"`,
      `area = "vehicles"`,
      `severity = "medium"`,
      `date = ${iso(D.bollo)}`,
      `repeat = "yearly"`,
      `remind_days = [7, 3]`,
    ]),
    commit: "Bollo auto, promemoria a 7 e 3 giorni",
    chips: [{ id: "bollo", name: "Bollo auto", date: D.bollo, severity: "medium", area: "Veicoli" }],
    message: {
      html: `<b>Bollo auto</b> aggiunto: scade il ${fmtShort(D.bollo)}. Ti avviso a 7 e a 3 giorni.`,
      doneFor: "bollo",
    },
    tag: "Archiviato",
  },
}

const wait = (ms: number) => new Promise<void>((ok) => setTimeout(ok, reducedMotion() ? Math.min(ms, 60) : ms))
const hash = () => Math.random().toString(16).slice(2, 9)

export function initDemo(): { setPrivate: (on: boolean) => void } {
  const app = $("#app")
  const docs = [...document.querySelectorAll<HTMLButtonElement>(".doc")]
  const dropzone = $("#dropzone")
  const log = $("#log")
  const state = $("#agent-state")
  const chipsEl = $("#chips")
  const tg = $("#tg")
  const tgEmpty = $("#tg-empty")
  const thread = $("#thread")
  const steps = [...document.querySelectorAll<HTMLLIElement>("#steps li")]
  const privacyBtn = $<HTMLButtonElement>("#demo-privacy")

  $("#app-date").textContent = fmtLong(T0)

  let chips: Chip[] = BASE.map((c) => ({ ...c }))
  const filed = new Set<DocId>()
  let busy = false
  let run = 0 // bumps on reset, so stale timers stop writing

  function step(n: number) {
    steps.forEach((li, i) => {
      const k = i + 1
      li.classList.toggle("is-on", k === n)
      if (k < n) li.classList.add("is-past")
    })
  }

  function renderChips() {
    const sorted = [...chips].sort((a, b) => a.date.getTime() - b.date.getTime())
    chipsEl.innerHTML = ""
    for (const c of sorted) {
      const days = daysBetween(T0, c.date)
      const lv = level(days, c.severity, c.done)
      const li = document.createElement("li")
      li.className = `chip is-${lv}${c.fresh ? " is-new" : ""}`
      li.innerHTML = `<span class="chip__day">${c.done ? "✓" : c.date.getDate()}</span><span class="chip__name">${c.name}</span><span class="chip__when">${c.done ? "fatta" : relative(days)}</span>`
      li.title = `${c.name}, ${fmtFull(c.date)}, ${c.area}`
      chipsEl.append(li)
      c.fresh = false
    }
  }

  function setBusy(on: boolean) {
    busy = on
    state.textContent = on ? "Al lavoro" : "In attesa"
    state.classList.toggle("is-busy", on)
    for (const d of docs) if (!filed.has(d.dataset.doc as DocId)) d.disabled = on
  }

  function addLine(line: Line) {
    const li = document.createElement("li")
    li.className = `log__line${line.kind ? " is-" + line.kind : ""}`
    li.innerHTML = `<i data-lucide="${line.icon}"></i><span>${line.html}</span>`
    log.append(li)
    renderIcons(li)
  }

  async function fly(from: HTMLElement) {
    if (reducedMotion()) return
    const a = from.getBoundingClientRect()
    const b = dropzone.getBoundingClientRect()
    const ghost = from.cloneNode(true) as HTMLElement
    Object.assign(ghost.style, {
      position: "fixed",
      left: `${a.left}px`,
      top: `${a.top}px`,
      width: `${a.width}px`,
      margin: "0",
      zIndex: "60",
      pointerEvents: "none",
    })
    document.body.append(ghost)
    const dx = b.left + b.width / 2 - (a.left + a.width / 2)
    const dy = b.top + b.height / 2 - (a.top + a.height / 2)
    await ghost.animate(
      [
        { transform: "none", opacity: 1 },
        { transform: `translate(${dx * 0.6}px, ${dy * 0.6 - 30}px) rotate(-4deg) scale(0.8)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0 },
      ],
      { duration: 650, easing: "cubic-bezier(0.5, 0, 0.2, 1)" },
    ).finished
    ghost.remove()
  }

  async function file(id: DocId, viaDrop = false) {
    if (busy || filed.has(id)) return
    const me = run
    const btn = docs.find((d) => d.dataset.doc === id)!
    const script = SCRIPTS[id]
    setBusy(true)
    btn.classList.add("is-busy")
    if (!viaDrop) await fly(btn)
    dropzone.classList.remove("is-gulp")
    void dropzone.offsetWidth
    dropzone.classList.add("is-gulp")
    step(2)
    follow(log.closest(".pane")!)

    const empty = log.querySelector(".log__empty")
    empty?.remove()
    const sep = document.createElement("li")
    sep.className = "log__sep"
    sep.textContent = `inbox/${iso(T0)}-${id}-${hash().slice(0, 6)}`
    log.append(sep)

    for (const line of script.lines) {
      await wait(620)
      if (me !== run) return
      addLine(line)
    }
    if (script.diff) {
      await wait(500)
      if (me !== run) return
      const li = document.createElement("li")
      const pre = document.createElement("pre")
      pre.className = "diff"
      li.append(pre)
      log.append(li)
      for (const row of script.diff.split("\n")) {
        pre.innerHTML += (pre.innerHTML ? "\n" : "") + row
        await wait(110)
        if (me !== run) return
      }
    }
    await wait(450)
    if (me !== run) return
    addLine({ icon: "git-commit-horizontal", html: `${code(hash())} ${script.commit}`, kind: "ok" })

    filed.add(id)
    btn.classList.remove("is-busy")
    btn.classList.add(script.message.warn ? "is-flagged" : "is-filed")
    btn.querySelector(".doc__tag")!.textContent = script.tag
    btn.disabled = true
    btn.draggable = false

    for (const c of script.chips) chips.push({ ...c, fresh: true })
    renderChips()
    await wait(700)
    if (me !== run) return
    notify(script)
    follow(chipsEl.closest(".pane")!)
    step(3)
    setBusy(false)
  }

  function notify(script: Script) {
    tgEmpty.hidden = true
    const msg = document.createElement("div")
    msg.className = `msg${script.message.warn ? " is-warn" : ""}`
    msg.innerHTML = `${script.message.html}<time>08:30</time>`
    const target = script.message.doneFor
    if (target) {
      const actions = document.createElement("div")
      actions.className = "msg__actions"
      const done = document.createElement("button")
      done.type = "button"
      done.className = "msg__btn"
      done.innerHTML = `<i data-lucide="check"></i>Fatto`
      done.addEventListener("click", () => {
        const c = chips.find((x) => x.id === target)
        if (c) c.done = true
        renderChips()
        done.disabled = true
        done.innerHTML = `<i data-lucide="check"></i>Segnato`
        renderIcons(done)
        stamp(msg, "Fatto!", "stamp--done")
      })
      actions.append(done)
      msg.append(actions)
    } else {
      stamp(msg, "Phishing")
    }
    tg.append(msg)
    renderIcons(msg)
    // keep the newest two reminders
    const all = tg.querySelectorAll(".msg")
    if (all.length > 2) all[0].remove()
  }

  /** On one-column layouts the panes stack, so bring the one that changes into view. */
  function follow(el: Element) {
    if (!matchMedia("(max-width: 1039px)").matches) return
    el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" })
  }

  function stamp(host: HTMLElement, text: string, extra = "") {
    const el = document.createElement("span")
    el.className = `stamp ${extra}`
    el.style.setProperty("--r", `${Math.round(Math.random() * 10 - 8)}deg`)
    el.textContent = text
    host.append(el)
  }

  // ---- chat ----
  function upcoming(within: number) {
    return chips
      .filter((c) => !c.done)
      .map((c) => ({ c, days: daysBetween(T0, c.date) }))
      .filter((x) => x.days >= 0 && x.days <= within)
      .sort((a, b) => a.days - b.days)
  }

  function answer(q: string): { html: string; src?: string } {
    switch (q) {
      case "soon": {
        const list = upcoming(30)
        if (!list.length) return { html: `<p>Niente nei prossimi 30 giorni. Goditela.</p>`, src: "deadlines.toml" }
        const items = list
          .map(({ c, days }) => `<li><b>${c.name}</b>, ${fmtShort(c.date)} (${relative(days)})</li>`)
          .join("")
        const tail = filed.size < 2 ? `<p>Mandami gli altri documenti e la lista si allunga.</p>` : ""
        return { html: `<p>Nei prossimi 30 giorni:</p><ul>${items}</ul>${tail}`, src: "deadlines.toml" }
      }
      case "tari":
        if (!filed.has("tari"))
          return {
            html: `<p>Non trovo ancora un avviso TARI ${year} nel registro. Mandami la PEC del Comune, è la prima della colonna «In arrivo», e la archivio.</p>`,
          }
        return {
          html: `<p>Per il ${year} la TARI è ${s("€ 287,00")}, in due rate da ${s("€ 143,50")}: entro il ${fmtShort(D.tari1)} e il ${fmtShort(D.tari2)}.</p><p>Il pagamento lo fai tu, con il modulo allegato all'avviso. Quando hai pagato, premi «Fatto» su Telegram.</p>`,
          src: `cases/${year}-tari/README.md · deadlines.toml`,
        }
      case "phish":
        if (!filed.has("phishing"))
          return {
            html: `<p>Mandamela e la controllo. Già dal mittente, ${code("agenzia-entrate-servizi.info")}, non sembra l'Agenzia delle Entrate.</p>`,
          }
        return {
          html: `<p>No. L'ho segnalata come possibile phishing: il dominio è ${code("agenzia-entrate-servizi.info")}, non ${code("agenziaentrate.gov.it")}, e chiede i dati della carta.</p><p>Non aprire i link. I rimborsi veri si controllano nell'area riservata del sito dell'Agenzia.</p>`,
          src: `inbox/${iso(T0)}-phishing`,
        }
      case "pay": {
        const extra = filed.has("multa")
          ? `<p>Per la multa ZTL ho già tutto: ${s("€ 58,10")} entro il ${fmtShort(D.fine5)}, verbale n. ${s("2026/0004471")}.</p>`
          : ""
        return {
          html: `<p>No: non pago mai al posto tuo, non firmo e non scrivo agli enti. Ti preparo importo, scadenza e riferimenti, poi paghi tu.</p>${extra}`,
          src: "AGENTS.md",
        }
      }
      default:
        return {
          html: `<p>In questa demo rispondo solo alle domande suggerite. Nell'app vera leggo i tuoi file e rispondo su tutto quello che c'è nel registro.</p>`,
        }
    }
  }

  function wordify(root: HTMLElement) {
    let i = 0
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    while (walker.nextNode()) nodes.push(walker.currentNode as Text)
    for (const node of nodes) {
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
  }

  let chatBusy = false
  async function ask(q: string, label: string) {
    if (chatBusy) return
    chatBusy = true
    const me = run
    step(4)
    const mine = document.createElement("div")
    mine.className = "bub bub--me"
    mine.textContent = label
    thread.append(mine)
    const typing = document.createElement("div")
    typing.className = "bub bub--ai bub--typing"
    typing.setAttribute("aria-label", "Claude sta scrivendo")
    typing.innerHTML = "<i></i><i></i><i></i>"
    thread.append(typing)
    await wait(900)
    typing.remove()
    if (me !== run) return
    const a = answer(q)
    const bub = document.createElement("div")
    bub.className = "bub bub--ai"
    bub.innerHTML = a.html
    wordify(bub)
    if (a.src) {
      const src = document.createElement("span")
      src.className = "bub__src"
      src.textContent = `fonte: ${a.src}`
      bub.append(src)
    }
    thread.append(bub)
    // keep the thread short: last three exchanges
    while (thread.children.length > 6) thread.firstElementChild?.remove()
    chatBusy = false
  }

  // ---- wiring ----
  for (const d of docs) {
    d.addEventListener("click", () => file(d.dataset.doc as DocId))
    d.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData("text/plain", d.dataset.doc!)
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"
      d.classList.add("is-dragging")
    })
    d.addEventListener("dragend", () => d.classList.remove("is-dragging"))
  }
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault()
    dropzone.classList.add("is-over")
  })
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-over"))
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault()
    dropzone.classList.remove("is-over")
    const id = e.dataTransfer?.getData("text/plain") as DocId | undefined
    if (id && id in SCRIPTS) file(id, true)
  })

  for (const b of document.querySelectorAll<HTMLButtonElement>(".sug")) {
    b.addEventListener("click", () => ask(b.dataset.q!, b.textContent!.trim()))
  }
  const form = $<HTMLFormElement>("#chat-form")
  const input = $<HTMLInputElement>("#chat-input")
  form.addEventListener("submit", (e) => {
    e.preventDefault()
    const text = input.value.trim()
    if (!text) return
    input.value = ""
    const t = text.toLowerCase()
    const q = /tari|rifiuti/.test(t)
      ? "tari"
      : /phish|rimborso|truffa|vera/.test(t)
        ? "phish"
        : /pag(a|hi)|multa/.test(t)
          ? "pay"
          : /scad|prossim|mese|30/.test(t)
            ? "soon"
            : "other"
    ask(q, text)
  })

  $("#demo-reset").addEventListener("click", () => {
    run++
    chips = BASE.map((c) => ({ ...c }))
    filed.clear()
    chatBusy = false
    setBusy(false)
    for (const d of docs) {
      d.disabled = false
      d.draggable = true
      d.classList.remove("is-filed", "is-flagged", "is-busy")
      d.querySelector(".doc__tag")!.textContent = ""
    }
    log.innerHTML = `<li class="log__empty">Niente in corso. Ogni documento viene archiviato circa un minuto dopo l'arrivo: qui ci mette qualche secondo.</li>`
    tg.querySelectorAll(".msg").forEach((m) => m.remove())
    tgEmpty.hidden = false
    thread.innerHTML = ""
    steps.forEach((li) => li.classList.remove("is-past"))
    step(1)
    renderChips()
  })

  renderChips()

  return {
    setPrivate(on: boolean) {
      app.classList.toggle("is-private", on)
      privacyBtn.setAttribute("aria-pressed", String(on))
      swapIcon(privacyBtn, on ? "eye-off" : "eye")
    },
  }
}
