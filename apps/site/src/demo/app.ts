// The demo: a working copy of the app's shell (apps/web/src/components/shell.tsx) on a made-up register.
// Sidebar, top bar, five views, the chat, ⌘K, live notices, Telegram reminders. Everything runs in the page.
import { track } from "../analytics.ts"
import { svg } from "../icons.ts"
import { eur, fmtDay, fmtFull, fmtShort, fmtWeekday, iso } from "../time.ts"
import { arrival, DOCS, type DocId } from "./arrivals.ts"
import { createChat, type ChatApi } from "./chat.ts"
import { alerts, createState, esc, hash7, lv, M, pressing, wait, type Ctx, type State, type TgMessage, type Toast } from "./core.ts"
import { PERSON, T0, type View } from "./data.ts"
import { badge, layoutCalendar, NAV, render, TITLES } from "./views.ts"

export type Layout = "wide" | "mid" | "phone"

export interface Cursor {
  to(target: Element, ms?: number): Promise<void>
  click(): Promise<void>
  hide(): void
}

export interface Demo {
  root: HTMLElement
  S: State
  chat: ChatApi
  cursor: Cursor
  go(view: View, focus?: string): void
  /** Opens or closes the chat; `focus` puts the caret in it (not when the guided story opens it). */
  setChat(open: boolean, focus?: boolean): void
  setPalette(open: boolean): void
  arrive(id: DocId): Promise<void>
  layout(): Layout
  setPrivate(on: boolean): void
  /** Keyboard shortcuts, as the app's: true when the key was used. */
  key(e: KeyboardEvent): boolean
}

export function createDemo(host: HTMLElement, opts: { onPrivacy: () => void }): Demo {
  const S = createState()
  const logs = new Map<string, string[]>()
  let lastTotal: number | null = null
  let arriving = false

  const root = document.createElement("div")
  root.className = "x"
  root.dataset.layout = "wide"
  root.innerHTML = `
    <aside class="x-side" aria-label="Menu">
      <div class="x-side__head">
        <span class="x-logo" aria-hidden="true">${logo()}</span><b class="x-side__name">Autocratico</b>
        <button type="button" class="x-ib x-ib--ghost x-side__fold" data-act="rail" aria-label="Riduci la barra">${svg("panel-left-close")}</button>
      </div>
      <nav class="x-nav" aria-label="Sezioni">${NAV.map(
        (n) =>
          `${n.group ? `<p class="x-nav__group">${n.group}</p>` : ""}<button type="button" class="x-nav__item" ${n.view ? `data-view="${n.view}"` : `data-off`} title="${n.label}">${svg(n.icon)}<span>${n.label}</span>${n.view === "deadlines" ? `<em class="x-count is-hot" data-alerts></em>` : n.label === "Pratiche" ? `<em class="x-count">3</em>` : ""}</button>`,
      ).join("")}</nav>
      <form class="x-ask" data-ask-form>
        <p>${svg("sparkles")}Chiedi a Claude</p>
        <label class="sr-only" for="x-ask-input">Chiedi a Claude</label>
        <span class="x-ask__field"><input id="x-ask-input" type="text" autocomplete="off" placeholder="Chiedi qualcosa…" /><button type="submit" aria-label="Chiedi a Claude">${svg("arrow-up")}</button></span>
        <button type="button" class="x-ask__open" data-act="chat">Apri la chat <kbd>C</kbd></button>
      </form>
      <button type="button" class="x-ask-mini" data-act="chat" aria-label="Chiedi a Claude">${svg("sparkles")}</button>
      <div class="x-me">
        <span class="x-avatar">${PERSON.initials}</span>
        <span class="x-me__main"><b class="s">${PERSON.name}</b><button type="button" class="x-mini-switch" data-act="privacy" role="switch" aria-checked="false"><i></i>Omissis</button></span>
      </div>
    </aside>

    <section class="x-main">
      <header class="x-top">
        <p class="x-top__date-sm">${fmtWeekday(T0)}, ${fmtFull(T0)} <i class="x-live" title="In diretta: gli aggiornamenti arrivano da soli"></i></p>
        <h2 class="x-title" data-title>Panoramica</h2>
        <div class="x-date" title="In diretta: gli aggiornamenti arrivano da soli"><span class="x-sq x-sq--dark">${svg("calendar")}</span><span><b>${fmtFull(T0)}</b><small>${fmtWeekday(T0)}</small></span><i class="x-live"></i></div>
        <button type="button" class="x-search" data-act="palette"><span class="x-sq x-sq--dark">${svg("search")}</span><span>Cerca una scadenza…</span><kbd>⌘</kbd><kbd>K</kbd></button>
        <span class="x-top__icons">
          <button type="button" class="x-ib x-ib--dark x-bell" data-act="bell" aria-label="Avvisi">${svg("bell")}<em class="x-badge" data-alerts></em></button>
          <button type="button" class="x-ib" data-act="privacy" aria-label="Omissis" aria-pressed="false">${svg("eye")}</button>
          <button type="button" class="x-ib" data-act="chat" aria-label="Chiedi a Claude" aria-pressed="false">${svg("sparkles")}</button>
        </span>
        <div class="x-pop" data-pop hidden></div>
      </header>
      <div class="x-view" data-host></div>
    </section>

    <nav class="x-tabbar" aria-label="Sezioni">
      <span class="x-tabbar__ind" aria-hidden="true"></span>
      ${(
        [
          ["overview", "layout-dashboard", "Panoramica"],
          ["deadlines", "calendar-clock", "Scadenze"],
          ["inbox", "inbox", "Inbox"],
          ["finance", "chart-line", "Finanze"],
          ["more", "ellipsis", "Altro"],
        ] as const
      )
        .map(
          ([v, icon, label]) =>
            `<button type="button" class="x-tab" ${v === "more" ? `data-act="more"` : `data-view="${v}"`}>${svg(icon)}<span>${label}</span>${v === "deadlines" ? `<em class="x-badge" data-alerts></em>` : ""}</button>`,
        )
        .join("")}
    </nav>
    <div class="x-sheet" data-more hidden>
      <button type="button" class="x-sheet__back" data-act="more" aria-label="Chiudi"></button>
      <div class="x-sheet__box">
        <button type="button" class="x-sheet__item" data-view="activity">${svg("history")}Attività</button>
        <button type="button" class="x-sheet__item" data-act="chat">${svg("sparkles")}Chiedi a Claude</button>
        <button type="button" class="x-sheet__item" data-act="privacy">${svg("eye-off")}Omissis</button>
        <button type="button" class="x-sheet__item" data-off>${svg("folder-open")}Pratiche</button>
      </div>
    </div>

    <div class="x-palette" data-palette hidden>
      <button type="button" class="x-palette__back" data-act="palette-close" aria-label="Chiudi" tabindex="-1"></button>
      <div class="x-palette__box" role="dialog" aria-label="Cerca e comandi">
        <label class="x-palette__field">${svg("search")}<input type="text" autocomplete="off" placeholder="Cerca, vai a, o chiedi a Claude…" aria-label="Cerca e comandi" /><kbd>esc</kbd></label>
        <div class="x-palette__list" role="listbox"></div>
        <footer class="x-palette__foot"><span><kbd>↑</kbd><kbd>↓</kbd>sposta</span><span><kbd>↵</kbd>apri</span><span><kbd>esc</kbd>chiudi</span><span class="x-palette__k"><kbd>⌘</kbd><kbd>K</kbd></span></footer>
      </div>
    </div>

    <div class="x-toasts" aria-live="polite"></div>
    <div class="x-tg" aria-live="polite"></div>
    <span class="x-cursor" aria-hidden="true">${svg("mouse-pointer-2")}</span>`
  host.append(root)

  const main = root.querySelector<HTMLElement>(".x-main")!
  const view = root.querySelector<HTMLElement>("[data-host]")!
  const title = root.querySelector<HTMLElement>("[data-title]")!
  const toasts = root.querySelector<HTMLElement>(".x-toasts")!
  const tg = root.querySelector<HTMLElement>(".x-tg")!
  const palette = root.querySelector<HTMLElement>("[data-palette]")!
  const pInput = palette.querySelector<HTMLInputElement>("input")!
  const pList = palette.querySelector<HTMLElement>(".x-palette__list")!
  const pop = root.querySelector<HTMLElement>("[data-pop]")!
  const more = root.querySelector<HTMLElement>("[data-more]")!
  const tabInd = root.querySelector<HTMLElement>(".x-tabbar__ind")!
  const cursorEl = root.querySelector<HTMLElement>(".x-cursor")!

  // ---------- rendering ----------
  function renderView() {
    view.innerHTML = render(S, logs)
    if (S.view === "overview") {
      layoutCalendar(view, S)
      countUp()
    }
    S.fresh.clear()
  }

  function renderChrome() {
    title.textContent = TITLES[S.view]
    const n = alerts(S)
    root.querySelectorAll<HTMLElement>("[data-alerts]").forEach((b) => {
      const was = b.textContent
      b.textContent = n ? String(n) : ""
      if (was && was !== b.textContent) bump(b)
    })
    root.querySelectorAll<HTMLElement>("[data-view]").forEach((b) => {
      const on = b.dataset.view === S.view
      b.classList.toggle("is-on", on)
      if (b.matches(".x-nav__item, .x-tab")) b.toggleAttribute("aria-current", on)
    })
    root.querySelectorAll<HTMLElement>('[data-act="chat"].x-ib').forEach((b) => b.setAttribute("aria-pressed", String(S.chat)))
    root.dataset.chat = String(S.chat)
    moveTabIndicator()
  }

  function renderAll() {
    renderChrome()
    renderView()
  }

  const bump = (el: Element) => {
    el.classList.remove("is-bump")
    void (el as HTMLElement).offsetWidth
    el.classList.add("is-bump")
  }

  function moveTabIndicator() {
    const on = root.querySelector<HTMLElement>(`.x-tab[data-view="${S.view}"]`) ?? root.querySelector<HTMLElement>('.x-tab[data-act="more"]')
    if (!on || !on.offsetWidth) return
    tabInd.style.width = `${on.offsetWidth}px`
    tabInd.style.transform = `translateX(${on.offsetLeft}px)`
  }

  /** The total rolls from its previous value, as CountUp in the app. */
  function countUp() {
    const el = view.querySelector<HTMLElement>("[data-count]")
    if (!el) return
    const to = Number(el.dataset.count)
    const from = lastTotal ?? to
    lastTotal = to
    if (from === to || M.instant) return
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1100)
      const e = p === 1 ? 1 : 1 - 2 ** (-10 * p)
      el.textContent = eur(from + (to - from) * e)
      if (p < 1) requestAnimationFrame(tick)
    }
    el.closest(".x-pay")?.classList.add("is-up")
    requestAnimationFrame(tick)
  }

  // ---------- layout ----------
  let layout: Layout = "wide"
  new ResizeObserver(() => {
    const w = root.clientWidth
    const next: Layout = w >= 1000 ? "wide" : w >= 720 ? "mid" : "phone"
    if (next !== layout) {
      layout = next
      root.dataset.layout = next
    }
    if (S.view === "overview") layoutCalendar(view, S)
    moveTabIndicator()
  }).observe(root)

  // ---------- notices ----------
  function toast(t: Toast) {
    const el = document.createElement("div")
    el.className = `x-toast${t.tone ? " is-" + t.tone : ""}`
    el.innerHTML = `<span class="x-toast__ic">${svg(t.icon)}</span><span class="x-toast__main"><b>${t.title}</b>${t.body ? `<small>${t.body}</small>` : ""}</span>${t.action ? `<button type="button">${t.action.label}</button>` : ""}`
    if (t.action) {
      const run = t.action.run
      el.querySelector("button")!.addEventListener("click", () => {
        run()
        dismiss()
      })
    }
    const dismiss = () => {
      el.classList.add("is-out")
      setTimeout(() => el.remove(), 260)
    }
    toasts.append(el)
    while (toasts.children.length > 3) toasts.firstElementChild!.remove()
    setTimeout(dismiss, 5600)
  }

  function telegram(m: TgMessage) {
    const el = document.createElement("div")
    el.className = `x-tgmsg${m.warn ? " is-warn" : ""}`
    el.innerHTML = `<header><span class="x-tgmsg__ic">${svg("send")}</span><b>Autocratico</b><small>Telegram · ora</small></header><p>${m.html}</p>${
      m.deadline
        ? `<div class="x-tgmsg__acts"><button type="button" data-tg="done">${svg("check")}Fatto</button><button type="button" data-tg="snooze">+1 h</button><button type="button" data-tg="tomorrow">Domani 9:00</button></div>`
        : ""
    }`
    const dismiss = () => {
      if (el.matches(":hover, :focus-within")) return void setTimeout(dismiss, 2500)
      el.classList.add("is-out")
      setTimeout(() => el.remove(), 320)
    }
    el.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>("[data-tg]")
      if (!b) return
      const kind = b.dataset.tg
      track("demo_telegram", { action: kind })
      if (kind === "done" && m.deadline) {
        setDone(m.deadline, true, false)
        stamp(el, "Fatto!")
        el.querySelectorAll("button").forEach((x) => (x.disabled = true))
        setTimeout(dismiss, 1600)
      } else {
        toast({ icon: "bell", title: kind === "snooze" ? "Ti riscrivo tra un'ora" : "Ti riscrivo domani alle 9:00" })
        dismiss()
      }
    })
    tg.append(el)
    while (tg.children.length > 2) tg.firstElementChild!.remove()
    setTimeout(dismiss, 9000)
  }

  function stamp(host: HTMLElement, text: string) {
    const el = document.createElement("span")
    el.className = "stamp stamp--done"
    el.style.setProperty("--r", `${Math.round(Math.random() * 10 - 8)}deg`)
    el.textContent = text
    host.append(el)
  }

  // ---------- changes ----------
  function commit(titleText: string, files: string[], diff: string, undo?: () => void): string {
    const hash = hash7()
    const now = new Date()
    S.commits.unshift({ hash, title: titleText, when: `oggi, ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`, files, diff, undo })
    return hash
  }

  function changed(fresh: string[] = [], notice = false) {
    fresh.forEach((id) => S.fresh.add(id))
    renderAll()
    if (notice) {
      root.querySelectorAll(".x-live").forEach(bump)
      const n = fresh.filter((id) => S.deadlines.some((d) => d.id === id)).length
      toast({
        icon: "calendar-clock",
        title: n > 1 ? `${n} scadenze aggiornate` : "Una scadenza è stata aggiornata",
        body: "Il registro è cambiato mentre lo guardavi.",
        action: S.view === "deadlines" ? undefined : { label: "Vedi", run: () => go("deadlines", fresh[0]) },
      })
    }
  }

  function setDone(id: string, done: boolean, withToast = true) {
    const d = S.deadlines.find((x) => x.id === id)
    if (!d || !!d.done === done) return
    d.done = done
    const key = `"${d.id}@${d.date ? iso(d.date) : "?"}"`
    const hash = commit(
      done ? `Fatto: ${d.title}` : `Di nuovo da fare: ${d.title}`,
      ["state.json"],
      `<span class="file">state.json</span>\n<span class="${done ? "add" : "del"}">${done ? "+" : "-"} ${key}</span>`,
      () => (d.done = !done),
    )
    track("demo_done", { done })
    changed([id, hash])
    if (withToast)
      toast({
        icon: done ? "circle-check" : "undo-2",
        tone: done ? "ok" : undefined,
        title: done ? "Segnata come fatta" : "Di nuovo da fare",
        body: `${d.title}${done && d.amount ? ` · spesa registrata nell'app Finance` : ""}`,
        action: { label: "Annulla", run: () => setDone(id, !done) },
      })
  }

  function revert(hash: string) {
    const c = S.commits.find((x) => x.hash === hash)
    if (!c || c.undone) return
    if (!c.undo) {
      toast({ icon: "history", title: "Questa è di esempio", body: "Nella demo si annullano le modifiche fatte durante la visita." })
      return
    }
    c.undo()
    c.undone = true
    const h = commit(`Annulla: ${c.title}`, c.files, c.diff.replace(/class="add">\+/g, 'class="del">-'))
    track("demo_undo")
    changed([h], true)
  }

  // ---------- navigation ----------
  function go(v: View, focus?: string) {
    if (S.view !== v) track("demo_view", { view: v })
    S.view = v
    if (layout !== "wide" && S.chat) setChat(false)
    more.hidden = true
    pop.hidden = true
    renderAll()
    main.scrollTo({ top: 0 })
    if (focus) {
      const el = view.querySelector<HTMLElement>(`[data-id="${focus}"], [data-commit="${focus}"], [data-in="${focus}"]`)
      if (el) {
        el.classList.add("is-focus")
        const top = el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - 90
        main.scrollTo({ top, behavior: "smooth" })
        if (el.dataset.commit) el.querySelector<HTMLElement>(".x-diff")!.hidden = false
      }
    }
  }

  function setChat(open: boolean, focus = true) {
    if (S.chat === open) return
    S.chat = open
    if (open) track("demo_chat")
    renderChrome()
    if (S.view === "overview") requestAnimationFrame(() => layoutCalendar(view, S))
    if (open && focus && layout !== "phone" && !matchMedia("(pointer: coarse)").matches) setTimeout(() => chat.focus(), 50)
  }

  // ---------- palette ----------
  let pItems: { el: string; run: () => void }[] = []
  let pActive = 0
  function paletteItems(q: string) {
    const query = q.trim().toLowerCase()
    const out: { group: string; html: string; run: () => void }[] = []
    out.push({
      group: "Claude",
      html: `<span class="x-sq x-sq--dark">${svg("sparkles")}</span><span class="x-pi__t">${query ? `Chiedi a Claude: “${esc(q.trim())}”` : "Fai una domanda a Claude"}</span><kbd>C</kbd>`,
      run: () => {
        setChat(true)
        if (query) void chat.ask(q.trim())
      },
    })
    const ds = (query ? S.deadlines.filter((d) => d.date && d.title.toLowerCase().includes(query)) : pressing(S)).slice(0, 4)
    for (const d of ds)
      out.push({
        group: "Scadenze",
        html: `<span class="x-sq">${svg("calendar-clock")}</span><span class="x-pi__t">${d.title}</span><small>${fmtShort(d.date!)}</small>${badge(d)}`,
        run: () => go("deadlines", d.id),
      })
    for (const n of NAV.filter((n) => n.view && (!query || n.label.toLowerCase().includes(query))))
      out.push({
        group: "Vai a",
        html: `<span class="x-sq">${svg(n.icon)}</span><span class="x-pi__t">${n.label}</span><span class="x-pi__keys"><kbd>G</kbd>poi<kbd>${n.key}</kbd></span>`,
        run: () => go(n.view!),
      })
    const actions = [
      { label: "Nascondi o mostra i dati personali", icon: "eye-off", key: "P", run: () => opts.onPrivacy() },
      { label: "Apri o chiudi la chat", icon: "sparkles", key: "C", run: () => setChat(!S.chat) },
      { label: "Nuova conversazione", icon: "square-pen", key: "", run: () => (chat.reset(), setChat(true)) },
    ]
    for (const a of actions.filter((a) => !query || a.label.toLowerCase().includes(query)))
      out.push({ group: "Azioni", html: `<span class="x-sq">${svg(a.icon)}</span><span class="x-pi__t">${a.label}</span>${a.key ? `<kbd>${a.key}</kbd>` : ""}`, run: a.run })
    return out
  }

  function paintPalette() {
    const items = paletteItems(pInput.value)
    pItems = items.map((i) => ({ el: i.html, run: i.run }))
    pActive = Math.min(pActive, items.length - 1)
    let group = ""
    pList.innerHTML = items
      .map((it, i) => {
        const g = it.group !== group ? `<p class="x-palette__group">${it.group}</p>` : ""
        group = it.group
        return `${g}<button type="button" class="x-pi${i === pActive ? " is-active" : ""}" role="option" aria-selected="${i === pActive}" data-pi="${i}">${it.html}</button>`
      })
      .join("")
  }

  function setPalette(open: boolean) {
    if (open === !palette.hidden) return
    palette.hidden = !open
    if (open) {
      track("demo_palette")
      pInput.value = ""
      pActive = 0
      paintPalette()
      if (!matchMedia("(pointer: coarse)").matches) pInput.focus({ preventScroll: true })
    }
  }

  function runPalette(i: number) {
    const it = pItems[i]
    setPalette(false)
    it?.run()
  }

  pInput.addEventListener("input", () => {
    pActive = 0
    paintPalette()
  })
  pInput.addEventListener("keydown", (e) => {
    e.stopPropagation()
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      pActive = (pActive + (e.key === "ArrowDown" ? 1 : -1) + pItems.length) % pItems.length
      paintPalette()
      pList.querySelector(".is-active")?.scrollIntoView({ block: "nearest" })
    } else if (e.key === "Enter") {
      e.preventDefault()
      runPalette(pActive)
    } else if (e.key === "Escape") {
      setPalette(false)
    }
  })
  pList.addEventListener("pointermove", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-pi]")
    if (!b || Number(b.dataset.pi) === pActive) return
    pActive = Number(b.dataset.pi)
    pList.querySelectorAll(".x-pi").forEach((x, i) => x.classList.toggle("is-active", i === pActive))
  })

  // ---------- bell ----------
  function togglePop() {
    if (!pop.hidden) return void (pop.hidden = true)
    const list = pressing(S).filter((d) => ["overdue", "urgent"].includes(lv(d)))
    pop.innerHTML = `<p class="x-pop__title">Da fare adesso</p>${
      list.length
        ? `<ul>${list.map((d) => `<li><button type="button" data-open="${d.id}"><span><b>${d.title}</b><small>${fmtDay(d.date!)} · ${d.area}</small></span>${badge(d)}</button></li>`).join("")}</ul>`
        : `<p class="x-muted">Niente di urgente.</p>`
    }`
    pop.hidden = false
  }

  // ---------- arrivals ----------
  function pushLog(id: string, html: string) {
    const lines = logs.get(id) ?? []
    lines.push(html)
    logs.set(id, lines)
    const ol = view.querySelector(`[data-log="${id}"]`)
    if (ol) {
      ol.insertAdjacentHTML("beforeend", html)
      reveal(ol.closest("li") ?? ol)
    }
  }

  /** Scrolls the main pane (never the page) so `el` is in view, as the app follows the agent's work. */
  function reveal(el: Element) {
    const box = main.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    const top = main.querySelector(".x-top")?.getBoundingClientRect().height ?? 0
    if (r.top >= box.top + top && r.bottom <= box.bottom - 16) return
    const delta = r.bottom > box.bottom - 16 && r.height < box.height - top ? r.bottom - box.bottom + 24 : r.top - box.top - top - 12
    main.scrollTo({ top: main.scrollTop + delta, behavior: M.instant ? "auto" : "smooth" })
  }

  async function arrive(id: DocId) {
    if (S.arrived.has(id) || arriving) return
    arriving = true
    track("demo_arrival", { doc: id })
    S.arrived.add(id)
    const doc = DOCS.find((d) => d.id === id)!
    const script = arrival(id)
    const item = { id: `in-${id}`, icon: doc.icon, title: doc.title, meta: doc.source, when: "adesso", status: "queued" as const }
    S.inbox.unshift({ ...item })
    const live = S.inbox[0]
    logs.set(item.id, [`<li class="x-log__sep mono">inbox/${iso(T0)}-${id}-${hash7().slice(0, 6)}</li>`])
    S.fresh.add(item.id)
    renderView()
    const row = view.querySelector(`[data-in="${item.id}"]`)
    if (row) reveal(row)
    await wait(800)
    live.status = "working"
    S.working = { file: doc.file, step: "Legge il documento" }
    if (S.view === "inbox" || S.view === "activity") renderView()
    for (const line of script.lines) {
      await wait(700)
      pushLog(item.id, `<li class="x-log__line${line.kind ? " is-" + line.kind : ""}">${svg(line.icon)}<span>${line.html}</span></li>`)
      S.working.step = line.html.replace(/<[^>]+>/g, "")
      if (S.view === "activity") renderView()
    }
    if (script.diff) {
      await wait(500)
      pushLog(item.id, `<li><pre class="x-diff"><span class="file">deadlines.toml</span>\n${script.diff.map((l, i) => `<span class="add" style="--i:${i}">+ ${l}</span>`).join("\n")}</pre></li>`)
      await wait(script.diff.length * 90 + 300)
    }
    await wait(400)
    const hash = commit(script.commit, script.files, `<span class="file">${script.files[0]}</span>\n${(script.diff ?? ["flagged = true"]).map((l) => `<span class="add">+ ${l}</span>`).join("\n")}`, () => {
      const ids = new Set(script.add.map((d) => d.id))
      S.deadlines = S.deadlines.filter((d) => !ids.has(d.id))
    })
    pushLog(item.id, `<li class="x-log__line is-ok">${svg("git-commit-horizontal")}<span><code>${hash}</code> ${script.commit}</span></li>`)
    live.status = script.flagged ? "flagged" : "filed"
    S.working = null
    S.deadlines.push(...script.add.map((d) => ({ ...d })))
    changed([...script.add.map((d) => d.id), hash])
    toast(
      script.flagged
        ? { icon: "shield-alert", tone: "warn", title: "Possibile phishing", body: "Segnalata nell'inbox. Nessuna scadenza aggiunta." }
        : {
            icon: "circle-check",
            tone: "ok",
            title: "L'agente ha finito",
            body: script.add.length > 1 ? `${script.add.length} scadenze aggiunte` : "Una scadenza aggiunta",
            action: { label: "Vedi", run: () => go("deadlines", script.add[0].id) },
          },
    )
    await wait(900)
    telegram(script.telegram)
    arriving = false
  }

  // ---------- cursor (for the guided story) ----------
  const cursor: Cursor = {
    async to(target, ms = 750) {
      const r = root.getBoundingClientRect()
      const t = target.getBoundingClientRect()
      cursorEl.classList.add("is-on")
      cursorEl.style.transitionDuration = M.instant ? "0ms" : `${ms}ms`
      cursorEl.style.transform = `translate(${t.left - r.left + t.width * 0.55}px, ${t.top - r.top + t.height * 0.6}px)`
      await wait(ms + 60)
    },
    async click() {
      bump(cursorEl)
      await wait(220)
    },
    hide() {
      cursorEl.classList.remove("is-on")
    },
  }

  // ---------- chat ----------
  const ctx: Ctx = {
    S,
    changed,
    toast,
    telegram,
    go,
    commit,
    setDone: (id, done) => setDone(id, done, false),
    ask: (q) => {
      setChat(true)
      void chat.ask(q)
    },
  }
  const chat = createChat(ctx)
  root.querySelector(".x-main")!.after(chat.el)

  // ---------- events ----------
  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement
    const pi = t.closest<HTMLElement>("[data-pi]")
    if (pi) return runPalette(Number(pi.dataset.pi))
    const act = t.closest<HTMLElement>("[data-act]")?.dataset.act
    if (act === "chat") return setChat(!S.chat)
    if (act === "privacy") return opts.onPrivacy()
    if (act === "palette") return setPalette(true)
    if (act === "palette-close") return setPalette(false)
    if (act === "bell") return togglePop()
    if (act === "more") return void (more.hidden = !more.hidden)
    if (act === "rail") return void root.toggleAttribute("data-rail")
    if (act === "show-done") {
      S.showDone = !S.showDone
      return renderView()
    }
    const v = t.closest<HTMLElement>("[data-view]")?.dataset.view as View | undefined
    if (v) return go(v)
    if (t.closest("[data-off]"))
      return toast({ icon: "sparkles", title: "Non in questa demo", body: "Qui ci sono Panoramica, Scadenze, Inbox, Finanze e Attività. Pratiche, Profilo e Archivio sono nell'app." })
    const range = t.closest<HTMLElement>("[data-range]")?.dataset.range
    if (range) {
      S.range = Number(range) as State["range"]
      return renderView()
    }
    const payR = t.closest<HTMLElement>("[data-pay]")?.dataset.pay
    if (payR) {
      S.payRange = Number(payR) as State["payRange"]
      return renderView()
    }
    const area = t.closest<HTMLElement>("[data-area]")?.dataset.area
    if (area) {
      S.area = area
      return renderView()
    }
    const done = t.closest<HTMLElement>("[data-done]")?.dataset.done
    if (done) return setDone(done, true)
    const undone = t.closest<HTMLElement>("[data-undone]")?.dataset.undone
    if (undone) return setDone(undone, false)
    const arr = t.closest<HTMLElement>("[data-arrive]")?.dataset.arrive
    if (arr) return void arrive(arr as DocId)
    const diff = t.closest<HTMLElement>("[data-diff]")?.dataset.diff
    if (diff) {
      const pre = view.querySelector<HTMLElement>(`[data-commit="${diff}"] .x-diff`)!
      pre.hidden = !pre.hidden
      return
    }
    const rev = t.closest<HTMLElement>("[data-revert]")?.dataset.revert
    if (rev) return revert(rev)
    const openId = t.closest<HTMLElement>("[data-open]")?.dataset.open
    if (openId) return go("deadlines", openId)
    const q = t.closest<HTMLElement>("[data-ask]")?.dataset.ask
    if (q) return ctx.ask(q)
  })
  root.querySelector<HTMLFormElement>("[data-ask-form]")!.addEventListener("submit", (e) => {
    e.preventDefault()
    const input = (e.currentTarget as HTMLFormElement).querySelector("input")!
    const text = input.value.trim()
    input.value = ""
    setChat(true)
    if (text) void chat.ask(text)
  })
  root.querySelector("#x-ask-input")!.addEventListener("keydown", (e) => e.stopPropagation())
  document.addEventListener("pointerdown", (e) => {
    if (!pop.hidden && !(e.target as Element).closest("[data-pop], [data-act='bell']")) pop.hidden = true
  })

  let g = 0
  function key(e: KeyboardEvent): boolean {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      setPalette(palette.hidden === true)
      return true
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return false
    if (e.key === "Escape") {
      if (!palette.hidden) setPalette(false)
      else if (!pop.hidden) pop.hidden = true
      else if (S.chat) setChat(false)
      else return false
      return true
    }
    const k = e.key.toLowerCase()
    if (Date.now() - g < 900) {
      const target = NAV.find((n) => n.key?.toLowerCase() === k)
      g = 0
      if (target?.view) {
        go(target.view)
        return true
      }
    }
    if (k === "g") {
      g = Date.now()
      return true
    }
    if (k === "/") {
      setPalette(true)
      return true
    }
    if (k === "c") {
      setChat(!S.chat)
      return true
    }
    return false
  }

  renderAll()

  return {
    root,
    S,
    chat,
    cursor,
    go,
    setChat,
    setPalette,
    arrive,
    layout: () => layout,
    setPrivate(on) {
      root.querySelectorAll<HTMLElement>('.x-ib[data-act="privacy"]').forEach((b) => {
        b.setAttribute("aria-pressed", String(on))
        b.innerHTML = svg(on ? "eye-off" : "eye")
      })
      root.querySelectorAll('.x-mini-switch[data-act="privacy"]').forEach((b) => b.setAttribute("aria-checked", String(on)))
    },
    key,
  }
}

/** The app's mark (apps/web/src/components/logo.tsx): the letter rises in, a highlight crosses it on hover. */
export function logo(): string {
  return `<svg viewBox="0 0 100 100"><path class="x-logo__letter" fill="currentColor" fill-rule="evenodd" d="M44 20h12l21 60H64l-4.5-15h-19L36 80H23zm-6 36h24l-12-34z"/></svg><i class="x-logo__shine"></i>`
}
