import "./styles.css"
import { initAnalytics, track } from "./analytics.ts"
import { initDemo } from "./demo.ts"
import { renderIcons, swapIcon } from "./icons.ts"
import { LEVEL_LABEL, addDays, daysBetween, fmtLong, fmtShort, level, reducedMotion, relative, today, type Severity } from "./time.ts"
import { initWaitlist } from "./waitlist.ts"

renderIcons()
initAnalytics()
initWaitlist()

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!
const T0 = today()

// ---- nav: a glass bar once the hero scrolls away ----
{
  const nav = $("#nav")
  const hero = $("#top")
  new IntersectionObserver(([e]) => nav.classList.toggle("is-stuck", !e.isIntersecting), {
    rootMargin: "-80px 0px 0px 0px",
  }).observe(hero)
}

// ---- hero pile: drifts with the pointer, and every click stamps it again ----
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
  const items: Item[] = [
    { name: "Bollo auto", area: "Veicoli", offset: 3, severity: "medium" },
    { name: "Rata condominio", area: "Casa", offset: 12, severity: "medium" },
    { name: "Gomme invernali", area: "Veicoli", offset: 42, severity: "low" },
    { name: "Revisione auto", area: "Veicoli", offset: 58, severity: "medium" },
    { name: "Saldo IMU", area: "Fisco", offset: imuDays, severity: "high" },
    { name: "Rinnovo carta d'identità", area: "Documenti", offset: 110, severity: "high" },
  ]
  const range = $<HTMLInputElement>("#tm-range")
  const out = $("#tm-out")
  const list = $("#tm-list")

  list.innerHTML = items
    .map(
      (it, i) => `<li class="row" data-i="${i}">
        <div><strong>${it.name}</strong><small></small></div>
        <span class="pill"></span>
        <button class="check" type="button" aria-pressed="false" aria-label="Segna fatto: ${it.name}"><i data-lucide="check"></i></button>
      </li>`,
    )
    .join("")
  renderIcons(list)

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
      row.querySelector("small")!.textContent = `${fmtShort(due)}, ${it.area}, gravità ${it.severity === "high" ? "alta" : it.severity === "medium" ? "media" : "bassa"}`
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

// ---- privacy: the P key, the switch and the demo share one state ----
const demo = initDemo()
{
  const sw = $<HTMLButtonElement>("#privacy-switch")
  const shot = $("#privacy-shot")
  const demoBtn = $<HTMLButtonElement>("#demo-privacy")
  let on = false
  const set = (v: boolean, via: string) => {
    on = v
    track("privacy_toggle", { on, via })
    sw.setAttribute("aria-checked", String(on))
    shot.classList.toggle("is-on", on)
    demo.setPrivate(on)
  }
  sw.addEventListener("click", () => set(!on, "switch"))
  demoBtn.addEventListener("click", () => set(!on, "demo"))
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() !== "p" || e.metaKey || e.ctrlKey || e.altKey) return
    const t = e.target as HTMLElement
    if (t.closest("input, textarea, [contenteditable]")) return
    set(!on, "key")
  })
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
