import { describe, expect, it } from "vitest"

import {
  agenda,
  answerWidgets,
  type FinanceData,
  parseDeadlines,
  parseWidget,
  stripActions,
  WIDGET_INSTRUCTIONS,
  WIDGET_TYPES,
  widgetBlock,
  customCodeProblem,
  customData,
  type SpecWidgetInput,
  type WidgetContext,
  type WidgetInput,
  widgetSeries,
  widgetValue,
  nextOccurrence,
} from "../src/index.ts"

const TODAY = "2026-10-14"
const deadlines = parseDeadlines(`
[[deadline]]
id = "car-tax"
title = "Car tax"
area = "car"
date = 2026-11-30
repeat = "yearly"
amount = 200

[[deadline]]
id = "insurance"
title = "Insurance"
area = "car"
date = 2026-10-01
repeat = "yearly"
amount = 500

[[deadline]]
id = "tari"
title = "Waste tax"
area = "home"
date = 2026-12-02
amount = 150

[[deadline]]
id = "passport"
title = "Passport"
area = "documents"
date = 2027-03-01
`)
const ctx: WidgetContext = {
  data: { today: TODAY, agenda: agenda(deadlines, { done: { "insurance@2026-10-01": "2026-10-02" } }, TODAY), cases: [] },
  finance: null,
}

const spec = {
  root: "main",
  elements: {
    main: { type: "Grid", props: { columns: 2 }, children: ["left", "chart"] },
    left: { type: "Metric", props: { label: "To pay", value: { sum: { from: "deadlines", payments: true, done: false, days: 90 } }, format: "money" } },
    chart: { type: "Chart", props: { kind: "bar", series: { from: "deadlines", by: "area", payments: true } } },
    unused: { type: "Separator" },
  },
}

describe("widget specs", () => {
  it("accepts a spec from the catalog and drops unreachable elements", () => {
    const r = parseWidget({ id: "money", title: "Money", spec })
    expect("widget" in r).toBe(true)
    const w = (r as { widget: SpecWidgetInput }).widget
    expect(w.kind).toBe("spec")
    expect(w.size).toBe("medium")
    expect(Object.keys(w.spec.elements).sort()).toEqual(["chart", "left", "main"])
    expect(w.spec.elements.main.children).toEqual(["left", "chart"])
  })

  it("rejects unknown components, bad props, missing children and cycles", () => {
    const bad = (s: unknown) => {
      const r = parseWidget({ id: "x", title: "X", spec: s })
      return "error" in r ? r.error : null
    }
    expect(bad({ root: "a", elements: { a: { type: "Script", props: {} } } })).toMatch(/unknown type "Script"/)
    expect(bad({ root: "a", elements: { a: { type: "Metric", props: { label: "L", value: "100" } } } })).toMatch(/a \(Metric\): value/)
    expect(bad({ root: "a", elements: { a: { type: "Metric", props: { label: "L", value: 1, onClick: "x" } } } })).toMatch(/Metric/)
    expect(bad({ root: "a", elements: { a: { type: "Stack", children: ["b"] } } })).toMatch(/child "b"/)
    expect(bad({ root: "a", elements: { a: { type: "Stack", children: ["b"] }, b: { type: "Stack", children: ["a"] } } })).toMatch(/cycle/)
    expect(bad({ root: "a", elements: { a: { type: "Text", props: { text: "hi" }, children: ["a"] } } })).toMatch(/takes no children/)
    expect(bad({ root: "a", elements: { a: { type: "Chart", props: { kind: "bar", series: { from: "cases", by: "month" } } } } })).toMatch(/Chart/)
    expect("error" in parseWidget({ id: "Not Kebab", title: "X", spec })).toBe(true)
  })

  it("documents every component for the agent", () => {
    for (const type of WIDGET_TYPES) expect(WIDGET_INSTRUCTIONS).toContain(`${type} {`)
  })
})

describe("custom widgets", () => {
  const code = `var sel = null
ac.on("pick", (e) => { sel = e.data.id; draw() })
function draw() { const rows = ac.data.due ?? []; ac.render('<style>.c{top:0}</style><a href="#x">x</a><svg><rect x="0" y="0" width="10" height="10"/></svg>' + rows.map((r) => ac.escape(r.title)).join("")) }
ac.onUpdate(draw)`

  it("accepts worker code with named queries", () => {
    const r = parseWidget({ id: "heat", title: "Heat", kind: "custom", data: { due: { from: "deadlines", days: 365 } }, code })
    expect("widget" in r && r.widget.kind).toBe("custom")
  })

  it("refuses network, storage, eval and hard-coded addresses", () => {
    const bad = [
      'fetch("/api/data")',
      "new WebSocket(x)",
      "navigator.sendBeacon(x, y)",
      "importScripts(x)",
      "new Worker(u)",
      "indexedDB.open(x)",
      'eval("1")',
      'new Function("x")',
      'setTimeout("x()", 1)',
      "import('x')",
      "x = '//evil.example/'",
      'x = "https:"',
    ]
    for (const c of bad) expect(customCodeProblem(c), c).not.toBeNull()
    expect(customCodeProblem(code)).toBeNull()
    const r = parseWidget({ id: "x", title: "X", kind: "custom", data: {}, code: 'fetch("x")' })
    expect("error" in r && r.error).toMatch(/^code: no network/)
  })

  it("gives the sandbox rows, without amounts in privacy mode", () => {
    const rows = customData({ due: { from: "deadlines", payments: true, done: false } }, ctx, false).due as { id: string; amount: number }[]
    expect(rows.map((r) => [r.id, r.amount])).toEqual([["car-tax", 200], ["tari", 150]])
    const hidden = customData({ due: { from: "deadlines", payments: true, done: false }, money: { from: "transactions" } }, ctx, true)
    expect((hidden.due as { amount: number | null }[]).every((r) => r.amount === null)).toBe(true)
    expect(hidden.money).toBeNull()
  })
})

describe("widget blocks in answers", () => {
  it("are hidden from the text and read back for the preview, once per id", () => {
    const w = (parseWidget({ id: "money", title: "Money", spec }) as { widget: WidgetInput }).widget
    const answer = `Here it is.\n\n${widgetBlock(w)}\n\n${widgetBlock({ ...w, title: "Money 2" })}`
    expect(stripActions(answer)).toBe("Here it is.")
    expect(stripActions('Here\n```widget\n{"id": "mo')).toBe("Here")
    expect(answerWidgets(answer).map((x) => x.title)).toEqual(["Money 2"])
    expect(answerWidgets("```widget\nnot json\n```")).toEqual([])
  })
})

describe("widget queries", () => {
  it("sums and counts occurrences", () => {
    // car tax 200 (47 days) + waste tax 150 (49 days); insurance is done, the passport is no payment.
    expect(widgetValue({ sum: { from: "deadlines", payments: true, done: false } }, ctx)).toBe(350)
    expect(widgetValue({ count: { from: "deadlines", areas: ["CAR"], past: 30 } }, ctx)).toBe(2)
    expect(widgetValue({ count: { from: "deadlines", days: 400, status: ["done"], past: 30 } }, ctx)).toBe(1)
    expect(widgetValue(42, ctx)).toBe(42)
  })

  it("groups a series by area and by month", () => {
    expect(widgetSeries({ from: "deadlines", by: "area", payments: true, done: false }, ctx)).toEqual([
      { key: "car", value: 200 },
      { key: "home", value: 150 },
    ])
    const months = widgetSeries({ from: "deadlines", by: "month", payments: true, done: false }, ctx, true)!
    expect(months.map((p) => p.key)).toEqual(["2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01"])
    expect(months.map((p) => p.value)).toEqual([0, 200, 350, 350])
  })

  it("needs the finance data for transactions", () => {
    expect(widgetValue({ sum: { from: "transactions" } }, ctx)).toBeNull()
    const finance = {
      today: TODAY,
      live: false,
      write: false,
      investments: [],
      links: {},
      matched: {},
      deadlines: [],
      mirror: {
        synced_at: "",
        categories: [{ id: "food", name: "Groceries", type: "expense", color: null, excludeFromBudget: false }],
        tags: [],
        recurring: [],
        transactions: [
          { id: "1", date: "2026-10-03", amount: 40, description: "Market", category: "food", type: "expense", tag: null, recurringId: null },
          { id: "2", date: "2026-09-20", amount: 60, description: "Market", category: "food", type: "expense", tag: null, recurringId: null },
          { id: "3", date: "2026-10-05", amount: 1000, description: "Salary", category: "pay", type: "earning", tag: null, recurringId: null },
        ],
      },
    } as FinanceData
    const f = { ...ctx, finance }
    expect(widgetValue({ sum: { from: "transactions", type: "expense", categories: ["groceries"] } }, f)).toBe(40)
    expect(widgetValue({ sum: { from: "transactions", type: "expense", months: 2 } }, f)).toBe(100)
    expect(widgetSeries({ from: "transactions", by: "month", months: 2, type: "expense" }, f)).toEqual([
      { key: "2026-09-01", value: 60 },
      { key: "2026-10-01", value: 40 },
    ])
  })

  it("finds the next open occurrence for a countdown", () => {
    expect(nextOccurrence("car-tax", ctx)?.date).toBe("2026-11-30")
    expect(nextOccurrence("missing", ctx)).toBeNull()
  })
})
