// The demo's views as HTML, from the state. Same structure and words as apps/web/src/views.
import { svg } from "../icons.ts"
import { addMonths, eur, fmtMonth, fmtMonthYear, fmtShort, fmtWeekdayShort, LEVEL_LABEL, relative } from "../time.ts"
import { AREA_ICON, alerts, daysLeft, lv, pressing, s, totals, type State } from "./core.ts"
import { CASH, EARNINGS, HOLDINGS, PORTFOLIO, SPENDING, T0, type Deadline, type View } from "./data.ts"
import { DOCS } from "./arrivals.ts"

export const TITLES: Record<View, string> = {
  overview: "Panoramica",
  deadlines: "Scadenze",
  inbox: "Inbox",
  finance: "Finanze",
  activity: "Attività",
}

export const NAV: { view: View | null; icon: string; label: string; group?: string; key?: string }[] = [
  { view: "overview", icon: "layout-dashboard", label: "Panoramica", group: "Agenda", key: "O" },
  { view: "deadlines", icon: "calendar-clock", label: "Scadenze", key: "D" },
  { view: null, icon: "folder-open", label: "Pratiche" },
  { view: "inbox", icon: "inbox", label: "Inbox", key: "I" },
  { view: "finance", icon: "chart-line", label: "Finanze", key: "F" },
  { view: null, icon: "user-round", label: "Profilo", group: "Archivio" },
  { view: null, icon: "archive", label: "Archivio" },
  { view: null, icon: "book-open", label: "Catalogo" },
  { view: "activity", icon: "history", label: "Attività", group: "Sistema", key: "A" },
  { view: null, icon: "settings", label: "Impostazioni" },
]

const seg = (attr: string, value: number) =>
  [3, 6, 12].map((n) => `<button type="button" data-${attr}="${n}" aria-pressed="${n === value}">${n} mesi</button>`).join("")

const fresh = (S: State, id: string) => (S.fresh.has(id) ? " is-fresh" : "")
const money = (d: Deadline) =>
  d.amount === undefined ? "" : d.amount === null ? "importo da definire" : `${d.estimate ? "≈ " : ""}${s(eur(d.amount))}`

/** Status pill, as StatusBadge: a dot and the days left. */
export const badge = (d: Deadline) => `<span class="x-st is-${lv(d)}">${d.done ? "fatta" : relative(daysLeft(d))}</span>`

function head(title: string, sub: string, extra = "") {
  return `<header class="x-card__head"><div><h3 class="x-card__title">${title}</h3><p class="x-card__sub">${sub}</p></div>${extra}</header>`
}

// ---------- Panoramica ----------
export function overview(S: State): string {
  const t = totals(S, S.payRange)
  const total = t.known + t.estimated
  const max = Math.max(1, ...t.months.map((m) => m.known + m.estimated))
  const nodate = S.deadlines.filter((d) => !d.date)
  const watch = pressing(S).slice(0, 4)
  return `<div class="x-grid">
  <article class="x-card x-cal" data-calendar>
    ${head("Calendario", `Prossimi ${S.range} mesi, per ambito`, `<div class="x-seg" role="group" aria-label="Periodo">${seg("range", S.range)}</div>`)}
    <div class="x-lanes" data-lanes></div>
    <ul class="x-legend">${(["overdue", "urgent", "soon", "planned", "done"] as const).map((l) => `<li><i class="x-dot is-${l}"></i>${LEVEL_LABEL[l]}</li>`).join("")}</ul>
  </article>

  <article class="x-card x-pay">
    <h3 class="x-card__title">${svg("wallet")} Da pagare</h3>
    <p class="x-card__sub">Prossimi ${S.payRange} mesi, scaduti inclusi</p>
    <div class="x-seg x-seg--dark" role="group" aria-label="Periodo">${seg("pay", S.payRange)}</div>
    <p class="x-pay__total">${t.estimated ? `<span class="x-pay__approx">≈</span>` : ""}<span class="s" data-count="${total}">${eur(total)}</span></p>
    <dl class="x-pay__split">
      <div><dt><i></i>Noti</dt><dd class="mono">${s(eur(t.known))}</dd></div>
      <div><dt><i class="est"></i>Stimati</dt><dd class="mono">≈ ${s(eur(t.estimated))}</dd></div>
    </dl>
    ${t.todo ? `<p class="x-pay__todo">${svg("circle-help")}${t.todo === 1 ? "1 pagamento senza importo" : `${t.todo} pagamenti senza importo`}</p>` : ""}
    <div class="x-bars" style="--n:${t.months.length}">${t.months
      .map(
        (m) =>
          `<div class="x-bars__col"><span class="x-bars__stack"><i class="est" style="height:${(m.estimated / max) * 100}%"></i><i style="height:${(m.known / max) * 100}%"></i></span><small>${fmtMonth(m.label)}</small></div>`,
      )
      .join("")}</div>
    <ul class="x-pay__list">${t.items
      .filter((d) => d.amount != null)
      .slice(0, 3)
      .map((d) => `<li class="is-${lv(d)}${fresh(S, d.id)}"><span><b>${d.title}</b><small>${fmtShort(d.date!)}</small></span><span class="mono">${money(d)}</span></li>`)
      .join("")}</ul>
  </article>

  <article class="x-card x-watch">
    ${head("Da tenere d'occhio", "Ordinate per urgenza e gravità", `<span class="x-card__icon">${svg("zap")}</span>`)}
    <ul>${watch
      .map(
        (d) =>
          `<li class="x-watch__row is-${lv(d)}${fresh(S, d.id)}" data-open="${d.id}"><span class="x-watch__main"><b>${d.title}</b><small>${fmtShort(d.date!)} · ${d.area}</small></span>${badge(d)}</li>`,
      )
      .join("")}</ul>
  </article>

  <article class="x-card x-todo">
    ${head("Date da inserire", "Senza data non posso avvisarti", `<span class="x-card__icon is-dark">${svg("calendar-plus")}</span>`)}
    ${
      nodate.length
        ? `<ul>${nodate.map((d) => `<li><span class="x-sq">${svg(AREA_ICON[d.area])}</span><b>${d.title}</b><i class="x-dot is-soon"></i></li>`).join("")}</ul>
    <button type="button" class="x-btn x-btn--soft" data-ask="Trova le date che mancano">${svg("sparkles")}Trovale con Claude</button>`
        : `<p class="x-muted">Tutte le scadenze hanno una data.</p>`
    }
  </article>

  <article class="x-card x-recent">
    ${head("Inbox", "Gli ultimi arrivi, già archiviati", `<button type="button" class="x-btn x-btn--soft x-btn--xs" data-view="inbox">Apri</button>`)}
    <ul>${S.inbox.slice(0, 3).map((i) => inboxRow(i, false)).join("")}</ul>
  </article>
</div>`
}

const LANE = 40

/** Calendar pills in lanes so they never overlap (apps/web/src/views/timeline.tsx). */
export function layoutCalendar(host: HTMLElement, S: State, onDone?: () => void) {
  const lanes = host.querySelector<HTMLElement>("[data-lanes]")
  if (!lanes) return
  const nameW = lanes.clientWidth < 520 ? 76 : 96
  const W = Math.max(120, lanes.clientWidth - nameW - 12)
  const start = T0.getTime()
  const end = addMonths(T0, S.range).getTime()
  const inWindow = S.deadlines.filter((d) => d.date && d.date.getTime() >= start && d.date.getTime() <= end && (!d.done || lv(d) === "done"))
  const rank = (d: Deadline) => ["overdue", "urgent", "soon", "planned", "done"].indexOf(lv(d)) * 100_000 + daysLeft(d)
  const rows = [...new Set(inWindow.map((d) => d.area))]
    .map((area) => {
      const own = inWindow.filter((d) => d.area === area).sort((a, b) => a.date!.getTime() - b.date!.getTime())
      const ends: number[] = []
      const items = own.map((d) => {
        const x = ((d.date!.getTime() - start) / (end - start)) * W
        const w = Math.min(160, 44 + d.title.length * 6.6)
        const flipped = x + w > W
        const from = Math.max(0, flipped ? x - w : x)
        let lane = ends.findIndex((f) => f < from - 6)
        if (lane === -1) lane = ends.length
        ends[lane] = from + w
        return { d, x: from, w, lane, flipped }
      })
      return { area, urgency: Math.min(...own.map(rank)), items, height: Math.max(1, ends.length) * LANE + 8 }
    })
    .sort((a, b) => a.urgency - b.urgency)
  const ticks: string[] = []
  const tick = new Date(T0.getFullYear(), T0.getMonth() + 1, 1)
  while (tick.getTime() <= end) {
    ticks.push(`<span style="left:${((tick.getTime() - start) / (end - start)) * 100}%">${fmtMonth(tick)}</span>`)
    tick.setMonth(tick.getMonth() + (S.range > 6 ? 2 : 1))
  }
  lanes.style.setProperty("--name", `${nameW}px`)
  lanes.innerHTML =
    rows
      .map(
        (r) => `<div class="x-lane"><span class="x-lane__name">${r.area}</span><div class="x-lane__track" style="height:${r.height}px">${r.items
          .map(
            ({ d, x, w, lane, flipped }) =>
              `<button type="button" class="x-pill is-${lv(d)}${flipped ? " is-flipped" : ""}${fresh(S, d.id)}" data-open="${d.id}" style="left:${x}px;top:${lane * LANE + 8}px;width:${w}px" title="${d.title} · ${LEVEL_LABEL[lv(d)]} · ${fmtShort(d.date!)} · ${relative(daysLeft(d))}"><span class="x-pill__day">${d.date!.getDate()}</span><span class="x-pill__t">${d.title}</span></button>`,
          )
          .join("")}</div></div>`,
      )
      .join("") + `<div class="x-ticks"><span class="x-ticks__line">${ticks.join("")}</span></div>`
  onDone?.()
}

// ---------- Scadenze ----------
export function deadlines(S: State): string {
  const areas = ["Tutti", "Casa", "Fisco", "Documenti", "Veicoli"]
  const list = S.deadlines
    .filter((d) => d.date && (S.showDone || !d.done) && (S.area === "Tutti" || d.area === S.area))
    .sort((a, b) => a.date!.getTime() - b.date!.getTime())
  const months = new Map<string, Deadline[]>()
  for (const d of list) {
    const k = `${d.date!.getFullYear()}-${d.date!.getMonth()}`
    months.set(k, [...(months.get(k) ?? []), d])
  }
  return `<div class="x-toolbar">
    <div class="x-tabs" role="group" aria-label="Ambito">${areas.map((a) => `<button type="button" data-area="${a}" aria-pressed="${S.area === a}">${a}</button>`).join("")}</div>
    <button type="button" class="x-toggle" data-act="show-done" role="switch" aria-checked="${S.showDone}"><span class="x-toggle__track"><span></span></span>Mostra fatte</button>
  </div>
  ${[...months.values()]
    .map(
      (ds) => `<article class="x-card x-month">
      ${head(fmtMonthYear(ds[0].date!), "", `<span class="x-card__sub">${ds.length === 1 ? "1 scadenza" : `${ds.length} scadenze`}</span>`).replace('<p class="x-card__sub"></p>', "")}
      <ul class="x-rows">${ds.map((d) => row(S, d)).join("")}</ul>
    </article>`,
    )
    .join("")}`
}

function row(S: State, d: Deadline): string {
  const amount = money(d)
  return `<li class="x-row is-${lv(d)}${fresh(S, d.id)}" data-id="${d.id}">
    <span class="x-tile">${d.done ? svg("check", "pop") : `<b>${d.date!.getDate()}</b><small>${fmtWeekdayShort(d.date!)}</small>`}</span>
    <span class="x-row__main"><b>${d.title}</b><small>${d.area}${amount ? ` · <span class="mono">${amount}</span>` : ""}${d.note ? `<span class="x-row__note"> · ${d.note}</span>` : ""}</small></span>
    <span class="x-row__end">${badge(d)}${
      d.done
        ? `<button type="button" class="x-btn x-btn--soft x-btn--xs" data-undone="${d.id}">${svg("undo-2")}Annulla</button>`
        : `<button type="button" class="x-btn x-btn--dark x-btn--xs" data-done="${d.id}">Segna fatto</button>`
    }</span>
  </li>`
}

// ---------- Inbox ----------
const TAG = { queued: "In coda", working: "L'agente lavora", filed: "Archiviato", flagged: "Segnalato" }

function inboxRow(i: State["inbox"][number], log: boolean, lines: string[] = []): string {
  return `<li class="x-in is-${i.status}" data-in="${i.id}">
    <span class="x-sq">${svg(i.icon)}</span>
    <span class="x-in__main"><b>${i.title}</b><small>${i.meta} · ${i.when}</small></span>
    <span class="x-tag is-${i.status}">${i.status === "working" ? `<span class="shiny">${TAG.working}</span>` : TAG[i.status]}</span>
    ${log && lines.length ? `<ol class="x-log" data-log="${i.id}">${lines.join("")}</ol>` : log ? `<ol class="x-log" data-log="${i.id}"></ol>` : ""}
  </li>`
}

export function inbox(S: State, logs: Map<string, string[]>): string {
  return `<article class="x-card x-sim">
    ${head("Simula un arrivo", "Scegli cosa ti arriva: l'agente lo legge, lo archivia e ti avvisa.", `<span class="x-tag">solo nella demo</span>`)}
    <div class="x-docs">${DOCS.map(
      (d) =>
        `<button type="button" class="x-doc" data-arrive="${d.id}"${S.arrived.has(d.id) ? " disabled" : ""}><span class="x-sq">${svg(d.icon)}</span><span class="x-doc__src">${d.source}</span><b>${d.title}</b><span class="x-doc__file mono">${d.file}</span></button>`,
    ).join("")}</div>
  </article>
  <article class="x-card">
    ${head("Arrivati", "Ogni arrivo resta collegato alla sua pratica, con l'originale a portata di mano")}
    <ul class="x-inbox">${S.inbox.map((i) => inboxRow(i, true, logs.get(i.id))).join("")}</ul>
  </article>`
}

// ---------- Finanze ----------
export function finance(): string {
  const spent = SPENDING.reduce((a, c) => a + c.value, 0)
  const top = Math.max(...SPENDING.map((c) => c.value))
  const value = HOLDINGS.reduce((a, h) => a + h.value, 0) + CASH
  const gain = HOLDINGS.reduce((a, h) => a + h.gain, 0)
  const lo = Math.min(...PORTFOLIO) * 0.98
  const hi = Math.max(...PORTFOLIO) * 1.01
  const pts = PORTFOLIO.map((v, i) => [(i / (PORTFOLIO.length - 1)) * 100, 100 - ((v - lo) / (hi - lo)) * 100])
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ")
  return `<div class="x-grid x-grid--fin">
  <article class="x-card x-fin">
    ${head(fmtMonthYear(T0), "Dall'app Finance, sincronizzata ogni ora", `<span class="x-card__icon">${svg("chart-line")}</span>`)}
    <div class="x-stats">
      <div><small>Uscite</small><b class="mono s">${eur(spent)}</b></div>
      <div><small>Entrate</small><b class="mono s is-in">${eur(EARNINGS)}</b></div>
      <div><small>Saldo</small><b class="mono s">${eur(EARNINGS - spent)}</b></div>
    </div>
    <ul class="x-cats">${SPENDING.map((c) => `<li><span>${c.name}</span><i style="--w:${(c.value / top) * 100}%"></i><span class="mono s">${eur(c.value)}</span></li>`).join("")}</ul>
    <p class="x-muted x-fin__note">${svg("check")}Quando segni fatta una scadenza, la spesa si registra lì con la categoria giusta.</p>
  </article>
  <article class="x-card x-inv">
    ${head(`${svg("landmark")} Investimenti`, "Dagli screenshot e dagli export dei tuoi broker")}
    <div class="x-stats">
      <div><small>Valore</small><b class="mono s">${eur(value)}</b></div>
      <div><small>Liquidità</small><b class="mono s">${eur(CASH)}</b></div>
      <div><small>Guadagno</small><b class="mono s is-in">+${eur(gain)}</b></div>
    </div>
    <svg class="x-chart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path class="x-chart__area" d="${line} L100 100 L0 100 Z"/><path class="x-chart__line" d="${line}" pathLength="1"/>
    </svg>
    <ul class="x-hold">${HOLDINGS.map((h) => `<li><span><b>${h.name}</b><small>${h.where}</small></span><span class="mono"><span class="s">${eur(h.value)}</span><small class="is-in s">+${eur(h.gain)}</small></span></li>`).join("")}</ul>
  </article>
</div>`
}

// ---------- Attività ----------
export function activity(S: State): string {
  return `<article class="x-card">
    ${head("Adesso", "Cosa stanno facendo l'agente e i job, in tempo reale")}
    ${
      S.working
        ? `<p class="x-now"><span class="x-thinking" aria-hidden="true"><i></i><i></i><i></i></span><span><span class="shiny">Smistamento · ${S.working.file}</span><small>${S.working.step}</small></span></p>`
        : `<p class="x-muted">Niente in corso. I nuovi documenti vengono elaborati circa un minuto dopo l'arrivo.</p>`
    }
  </article>
  <article class="x-card">
    ${head("Modifiche ai dati", "Ogni passaggio dell'agente è un commit nella cartella dati: controllalo o annullalo")}
    <ul class="x-commits">${S.commits
      .map(
        (c) => `<li class="x-commit${c.undone ? " is-undone" : ""}${fresh(S, c.hash)}" data-commit="${c.hash}">
        <span class="x-sq">${svg("git-commit-horizontal")}</span>
        <div class="x-commit__main"><b>${c.title}</b><small class="mono">${c.hash} · ${c.when} · ${c.files.join(", ")}</small>
          <div class="x-commit__acts"><button type="button" data-diff="${c.hash}">Mostra modifiche</button><button type="button" data-revert="${c.hash}"${c.undone ? " disabled" : ""}>${svg("undo-2")}${c.undone ? "Annullata" : "Annulla"}</button></div>
          <pre class="x-diff" hidden>${c.diff}</pre></div>
      </li>`,
      )
      .join("")}</ul>
  </article>`
}

export function render(S: State, logs: Map<string, string[]>): string {
  switch (S.view) {
    case "overview":
      return overview(S)
    case "deadlines":
      return deadlines(S)
    case "inbox":
      return inbox(S, logs)
    case "finance":
      return finance()
    case "activity":
      return activity(S)
  }
}

export { alerts }
