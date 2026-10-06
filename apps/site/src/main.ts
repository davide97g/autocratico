import "./styles.css"
import "./demo.css"
import { initAnalytics, track } from "./analytics.ts"
import { createDemo, type Demo } from "./demo/app.ts"
import { Q } from "./demo/chat.ts"
import { D } from "./demo/data.ts"
import { createDirector } from "./demo/hero.ts"
import { renderIcons, svg, swapIcon } from "./icons.ts"
import {
  LEVEL_LABEL,
  SEVERITY_LABEL,
  addDays,
  daysBetween,
  eur,
  fmtDay,
  fmtLong,
  fmtShort,
  fmtWeekdayShort,
  level,
  reducedMotion,
  relative,
  today,
  type Severity,
} from "./time.ts"
import { initWaitlist } from "./waitlist.ts"

renderIcons()
initAnalytics()
initWaitlist()

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!
const T0 = today()
const html = document.documentElement

// ---- nav: a glass bar once the hero scrolls away ----
{
  const nav = $("#nav")
  const onScroll = () => nav.classList.toggle("is-stuck", scrollY > 24)
  addEventListener("scroll", onScroll, { passive: true })
  onScroll()
}

// ---- theme: the new one spreads from the button, as in the app (View Transitions) ----
{
  const btn = $<HTMLButtonElement>("#theme")
  const dark = () => html.dataset.theme === "dark" || (!html.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches)
  const paint = () => {
    swapIcon(btn, dark() ? "sun" : "moon")
    btn.setAttribute("aria-label", dark() ? "Tema chiaro" : "Tema scuro")
  }
  paint()
  btn.addEventListener("click", (e) => {
    const next = dark() ? "light" : "dark"
    const apply = () => {
      html.dataset.theme = next
      paint()
    }
    try {
      localStorage.setItem("autocratico-theme", next)
    } catch {
      // private mode: the choice lasts this visit
    }
    track("theme_toggle", { theme: next })
    const vt = (document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } }).startViewTransition
    if (!vt || reducedMotion()) return apply()
    const x = e.clientX || innerWidth - 40
    const y = e.clientY || 30
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    vt.call(document, apply).ready.then(() =>
      html.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 520, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" },
      ),
    )
  })
}

// ---- the demo, and the story that opens it ----
const host = $("#demo-host")
const veil = $<HTMLButtonElement>("#veil")
const bar = $("#director")
let privacy = false
let demo: Demo = makeDemo()

function makeDemo(): Demo {
  host.innerHTML = ""
  const d = createDemo(host, { onPrivacy: () => setPrivacy(!privacy, "demo") })
  d.setPrivate(privacy)
  return d
}

const director = createDirector(() => demo, { bar, veil })

{
  const start = () => void director.play()
  if (reducedMotion()) start()
  else
    new IntersectionObserver(
      ([e], io) => {
        if (!e.isIntersecting) return
        io.disconnect()
        start()
      },
      { threshold: 0.35 },
    ).observe($("#frame"))
  veil.addEventListener("click", () => director.skip())
  $("#director-skip").addEventListener("click", () => director.skip())
  $("#director-replay").addEventListener("click", async () => {
    if (director.playing()) return
    track("hero_replay")
    demo = makeDemo()
    await director.play()
  })
}

/** Brings the demo into view, story finished, then does `then`. */
async function toDemo(then: (d: Demo) => void) {
  director.skip()
  $("#frame").scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" })
  while (director.playing()) await new Promise((ok) => setTimeout(ok, 60))
  setTimeout(() => then(demo), reducedMotion() ? 0 : 450)
}

for (const b of document.querySelectorAll<HTMLButtonElement>("[data-try]")) {
  b.addEventListener("click", () => {
    const what = b.dataset.try!
    track("try_in_demo", { what })
    void toDemo((d) => {
      if (what === "palette") return d.setPalette(true)
      d.setChat(true)
      if (what === "gmail") return void d.chat.typeDraft("Cosa dice questa email?", "https://mail.google.com/mail/u/0/#inbox/FMfcgzQbdTnVcxKpWw")
      const q = what === "imu" ? Q.imu : what === "remind" ? Q.remind : Q.week
      void d.chat.ask(q)
    })
  })
}
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-try-view]")) {
  b.addEventListener("click", () => {
    track("try_in_demo", { what: b.dataset.tryView })
    void toDemo((d) => d.go(b.dataset.tryView as "inbox"))
  })
}

// ---- keys: P for Omissis anywhere; the app's shortcuts while the demo is on screen ----
{
  let visible = false
  new IntersectionObserver(([e]) => (visible = e.intersectionRatio > 0.25), { threshold: [0, 0.25, 0.5] }).observe($("#frame"))
  document.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement
    if (t.closest("input, textarea, select, [contenteditable]")) return
    if (e.key.toLowerCase() === "p" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      setPrivacy(!privacy, "key")
      return
    }
    const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k"
    if (!visible && !cmdK) return
    if (cmdK && !visible) {
      e.preventDefault()
      void toDemo((d) => d.setPalette(true))
      return
    }
    const playing = director.playing()
    if (!demo.key(e)) return
    e.preventDefault()
    if (playing) director.skip()
  })
}

// ---- Omissis: one state for the page, the demo and the switch ----
function setPrivacy(on: boolean, via: string) {
  privacy = on
  track("privacy_toggle", { on, via })
  html.classList.toggle("omissis", on)
  $("#privacy-switch").setAttribute("aria-checked", String(on))
  demo.setPrivate(on)
}
$("#privacy-switch").addEventListener("click", () => setPrivacy(!privacy, "switch"))

// ---- pointer light on cards, as the app's cards ----
if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
  document.addEventListener(
    "pointermove",
    (e) => {
      const card = (e.target as Element).closest<HTMLElement>(".spot")
      if (!card) return
      const r = card.getBoundingClientRect()
      card.style.setProperty("--mx", `${e.clientX - r.left}px`)
      card.style.setProperty("--my", `${e.clientY - r.top}px`)
    },
    { passive: true },
  )
}

// ---- loops in the cards run only while they are on screen ----
{
  const io = new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.toggle("is-play", e.isIntersecting)), { threshold: 0.3 })
  document.querySelectorAll(".ai-card, .cell, .flow__step").forEach((el) => io.observe(el))
}

// ---- the paperwork pile: drifts with the pointer, every click stamps it again ----
{
  const pile = $("#pile")
  const stamps = $("#stamps")
  const WORDS = ["Protocollato", "In attesa", "Respinto", "Allegare copia", "Marca da bollo", "Ripassi domani", "Sollecito", "Scaduto"]
  let raf = 0
  if (!reducedMotion() && matchMedia("(pointer: fine)").matches) {
    pile.addEventListener("pointermove", (e) => {
      const r = pile.getBoundingClientRect()
      const mx = ((e.clientX - r.left) / r.width - 0.5) * 2
      const my = ((e.clientY - r.top) / r.height - 0.5) * 2
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        pile.style.setProperty("--mx", mx.toFixed(3))
        pile.style.setProperty("--my", my.toFixed(3))
      })
    })
    pile.addEventListener("pointerleave", () => {
      pile.style.setProperty("--mx", "0")
      pile.style.setProperty("--my", "0")
    })
  }
  let n = 0
  pile.addEventListener("click", (e) => {
    const r = pile.getBoundingClientRect()
    const el = document.createElement("span")
    el.className = "stamp"
    if (n === 0) track("pile_stamp")
    el.textContent = WORDS[n++ % WORDS.length]
    el.style.setProperty("--x", `${(((e.clientX - r.left) / r.width) * 100 - 12).toFixed(1)}%`)
    el.style.setProperty("--y", `${(((e.clientY - r.top) / r.height) * 100 - 5).toFixed(1)}%`)
    el.style.setProperty("--r", `${Math.round(Math.random() * 24 - 12)}deg`)
    stamps.append(el)
    if (stamps.children.length > 12) stamps.firstElementChild?.remove()
    pile.classList.remove("is-hit")
    void pile.offsetWidth
    pile.classList.add("is-hit")
  })
}

// ---- colour = time left: a real IMU countdown and a time machine ----
{
  const clock = $("#imu")
  let imu = new Date(T0.getFullYear(), 11, 16)
  if (imu < T0) imu = new Date(T0.getFullYear() + 1, 11, 16)
  const imuDays = daysBetween(T0, imu)
  const imuLevel = level(imuDays, "high")
  $("#imu-days").textContent = String(imuDays)
  $("#imu-pill").textContent = LEVEL_LABEL[imuLevel]
  clock.style.setProperty("--c", `var(--${imuLevel === "planned" ? "ink-fg" : imuLevel})`)

  interface Item {
    name: string
    area: string
    offset: number
    severity: Severity
    done?: boolean
  }
  // the demo's register, so the dates match what the demo shows
  const items: Item[] = [
    { name: "Prenotare la carta d'identità", area: "Documenti", offset: daysBetween(T0, D.carta), severity: "high" },
    { name: "Rata condominio", area: "Casa", offset: daysBetween(T0, D.condominio), severity: "medium" },
    { name: "Bollo auto", area: "Veicoli", offset: daysBetween(T0, D.bollo), severity: "medium" },
    { name: "Gomme invernali", area: "Veicoli", offset: daysBetween(T0, D.gomme), severity: "low" },
    { name: "Saldo IMU", area: "Casa", offset: imuDays, severity: "high" },
    { name: "Rinnovo RC auto", area: "Veicoli", offset: daysBetween(T0, D.rc), severity: "high" },
  ]
  const range = $<HTMLInputElement>("#tm-range")
  const out = $("#tm-out")
  const list = $("#tm-list")

  list.innerHTML = items
    .map(
      (it, i) => `<li class="row" data-i="${i}">
        <div><strong>${it.name}</strong><small></small></div>
        <span class="pill"></span>
        <button class="check" type="button" aria-pressed="false" aria-label="Segna fatto: ${it.name}">${svg("check")}</button>
      </li>`,
    )
    .join("")

  function paint() {
    const shift = Number(range.value)
    const now = addDays(T0, shift)
    range.style.setProperty("--fill", `${(shift / Number(range.max)) * 100}%`)
    out.textContent = shift === 0 ? `oggi, ${fmtLong(now)}` : `+${shift} giorni, ${fmtLong(now)}`
    list.querySelectorAll<HTMLLIElement>(".row").forEach((row) => {
      const it = items[Number(row.dataset.i)]
      const due = addDays(T0, it.offset)
      const days = daysBetween(now, due)
      const lv = level(days, it.severity, it.done)
      row.className = `row is-${lv}`
      row.querySelector("small")!.textContent = `${fmtShort(due)}, ${it.area}, gravità ${SEVERITY_LABEL[it.severity]}`
      row.querySelector(".pill")!.textContent = it.done ? "Fatta" : `${LEVEL_LABEL[lv]}, ${relative(days)}`
    })
  }
  range.addEventListener("input", paint)
  range.addEventListener("change", () => track("time_machine", { days: Number(range.value) }))
  list.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>(".check")
    if (!btn) return
    const it = items[Number(btn.closest<HTMLLIElement>(".row")!.dataset.i)]
    it.done = !it.done
    btn.setAttribute("aria-pressed", String(it.done))
    track("time_machine_done", { item: it.name, done: it.done })
    paint()
  })
  paint()
}

// ---- small live pieces in the sections ----
{
  // "Propone. Decidi tu.": a real yes/no
  const viz = $("#confirm-viz")
  viz.querySelector(".viz-a")!.innerHTML = `La prossima <b>Rata condominio</b> è del ${fmtDay(D.condominio)}, <span class="s">${eur(180)}</span>. La segno come pagata?`
  const yn = viz.querySelector<HTMLElement>(".viz-yn")!
  const out = viz.querySelector<HTMLElement>(".viz-out")!
  viz.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-viz]")
    if (!b) return
    const kind = b.dataset.viz
    track("section_confirm", { yes: kind === "yes" })
    yn.hidden = true
    out.hidden = false
    out.innerHTML =
      kind === "yes"
        ? `<p class="viz-q">Sì, confermo</p><span class="viz-cc rise"><span class="viz-cc__ic">${svg("file-pen")}</span><span><small>Registro aggiornato</small><b>Rata condominio segnata come pagata</b></span><span class="viz-cc__hash mono">a41c9e2 ${svg("chevron-right")}</span></span><button type="button" class="viz-again" data-viz="again">${svg("undo-2")}Annulla da Attività</button>`
        : kind === "no"
          ? `<p class="viz-q">No, lascia com'è</p><p class="viz-a rise">Va bene, la lascio com'è.</p><button type="button" class="viz-again" data-viz="again">${svg("rotate-ccw")}Rifai</button>`
          : ""
    if (kind === "again") {
      out.hidden = true
      yn.hidden = false
    }
  })

  // ⌘K: someone typing in the palette
  const typed = $("#pal-type")
  const ask = $("#pal-ask")
  const hit = $("#pal-hit")
  const card = typed.closest(".ai-card")!
  const WORDS: [string, string][] = [
    ["bollo", "Bollo auto"],
    ["condominio", "Rata condominio"],
    ["carta", "Prenotare la carta d'identità"],
  ]
  let w = 0
  const loop = async () => {
    for (;;) {
      if (!card.classList.contains("is-play") || reducedMotion()) {
        await new Promise((ok) => setTimeout(ok, 600))
        continue
      }
      const [word, title] = WORDS[w++ % WORDS.length]
      hit.textContent = title
      for (let i = 1; i <= word.length; i++) {
        typed.textContent = word.slice(0, i)
        ask.textContent = `Chiedi a Claude: “${word.slice(0, i)}”`
        await new Promise((ok) => setTimeout(ok, 110))
      }
      await new Promise((ok) => setTimeout(ok, 1800))
      for (let i = word.length; i >= 0; i--) {
        typed.textContent = word.slice(0, i)
        ask.textContent = i ? `Chiedi a Claude: “${word.slice(0, i)}”` : "Fai una domanda a Claude"
        await new Promise((ok) => setTimeout(ok, 40))
      }
      await new Promise((ok) => setTimeout(ok, 500))
    }
  }
  void loop()

  // Attività: undo for real
  $("#gitlog").addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>(".undo")
    if (!b) return
    const li = b.closest("li")!
    const undone = li.classList.toggle("is-undone")
    b.textContent = undone ? "Ripristina" : "Annulla"
    track("section_undo", { undone })
  })

  // Telegram: the buttons answer
  const tg = $("#tg-demo")
  tg.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("[data-tg]")
    if (!b) return
    const ok = tg.querySelector<HTMLElement>(".tg-bubble--ok")!
    const kind = b.dataset.tg
    track("section_telegram", { action: kind })
    ok.hidden = false
    ok.innerHTML =
      kind === "done"
        ? `${svg("circle-check")}Segnato come fatto. Prossimo: ${fmtDay(addDays(T0, 368))}.`
        : kind === "snooze"
          ? `${svg("bell")}Ti riscrivo tra un'ora.`
          : `${svg("bell")}Ti riscrivo domani alle 9:00.`
    ok.classList.remove("rise")
    void ok.offsetWidth
    ok.classList.add("rise")
    if (kind === "done") {
      const s = document.createElement("span")
      s.className = "stamp stamp--done"
      s.style.setProperty("--r", "-8deg")
      s.textContent = "Fatto!"
      tg.querySelector(".stamp")?.remove()
      tg.append(s)
    }
  })

  // the launch animation, again
  $("#splash-replay").addEventListener("click", () => {
    const s = $("#splash")
    s.classList.remove("is-replay")
    void s.offsetWidth
    s.classList.add("is-replay")
    track("splash_replay")
  })

  // privacy card: three real dates
  const rows: [string, Date, Severity, string][] = [
    ["Rata condominio", D.condominio, "medium", `Casa · <span class="s">${eur(180)}</span>`],
    ["TARI, prima rata", D.tari1, "medium", `<span class="s">Maria Rossi</span> · <span class="s">${eur(143.5)}</span>`],
    ["Bollo auto", D.bollo, "medium", `Targa <span class="s">AB123CD</span> · ≈ <span class="s">${eur(186.4)}</span>`],
  ]
  $(".privacy__card ul").innerHTML = rows
    .sort((a, b) => a[1].getTime() - b[1].getTime())
    .map(([name, date, sev, meta]) => {
      const lv = level(daysBetween(T0, date), sev)
      return `<li class="is-${lv}"><span class="tile"><b>${date.getDate()}</b><small>${fmtWeekdayShort(date)}</small></span><span><b>${name}</b><small>${meta}</small></span><span class="x-st is-${lv}">${relative(daysBetween(T0, date))}</span></li>`
    })
    .join("")
  $(".privacy__head span").textContent = "Prossime"
}

// ---- install: copy the commands ----
{
  const btn = $<HTMLButtonElement>("#copy")
  const label = btn.querySelector("span")!
  btn.addEventListener("click", async () => {
    const text = $("#cmd")
      .textContent!.split("\n")
      .map((l) => l.replace(/^\$\s*/, ""))
      .join("\n")
    try {
      await navigator.clipboard.writeText(text)
      track("copy_install")
      label.textContent = "Copiato"
      swapIcon(btn, "check")
    } catch {
      label.textContent = "Selezionalo e copia"
    }
    setTimeout(() => {
      label.textContent = "Copia"
      swapIcon(btn, "copy")
    }, 2000)
  })
}
