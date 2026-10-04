import { describe, expect, it } from "vitest"

import {
  agenda,
  byCategory,
  type FinanceRecurring,
  type FinanceTransaction,
  futureByMonth,
  futureExpenses,
  parseDeadlines,
  parseInvestments,
  periodStart,
  portfolio,
  projectRecurring,
  trend,
} from "../src/index.ts"

const tx = (date: string, amount: number, type: "expense" | "earning" = "expense", category = "food"): FinanceTransaction => ({
  id: `${date}-${amount}`,
  date,
  amount,
  description: "",
  category,
  type,
  tag: null,
  recurringId: null,
})

const template = (over: Partial<FinanceRecurring> = {}): FinanceRecurring => ({
  id: "rent",
  description: "Rent",
  amount: 700,
  category: "home",
  type: "expense",
  tag: null,
  dayOfMonth: 5,
  active: true,
  lastPeriod: "2026-09",
  ...over,
})

describe("periods", () => {
  it("starts weeks on Monday, across years", () => {
    expect(periodStart("2026-10-04", "week")).toBe("2026-09-28") // a Sunday
    expect(periodStart("2026-09-28", "week")).toBe("2026-09-28")
    expect(periodStart("2027-01-01", "week")).toBe("2026-12-28")
    expect(periodStart("2026-10-04", "month")).toBe("2026-10-01")
    expect(periodStart("2026-10-04", "year")).toBe("2026-01-01")
  })
})

describe("trend", () => {
  const list = [tx("2026-08-03", 10), tx("2026-08-30", 5.5), tx("2026-09-01", 20), tx("2026-09-15", 1000, "earning", "salary"), tx("2026-09-20", 3, "expense", "transfer")]

  it("sums expenses and earnings per month, empty months included", () => {
    const months = trend(list, "month", "2026-07-01", "2026-09-30")
    expect(months.map((b) => b.start)).toEqual(["2026-07-01", "2026-08-01", "2026-09-01"])
    expect(months[0]).toMatchObject({ expense: 0, earning: 0, net: 0 })
    expect(months[1]).toMatchObject({ expense: 15.5, earning: 0, net: -15.5, categories: { food: 15.5 } })
    expect(months[2]).toMatchObject({ expense: 23, earning: 1000, net: 977 })
  })
  it("leaves out excluded categories and dates outside the range", () => {
    const months = trend(list, "month", "2026-08-15", "2026-09-30", new Set(["transfer"]))
    expect(months[0].expense).toBe(5.5)
    expect(months[1].expense).toBe(20)
  })
  it("groups by ISO week and by year", () => {
    const weeks = trend(list, "week", "2026-08-24", "2026-09-06")
    expect(weeks.map((w) => [w.start, w.expense])).toEqual([
      ["2026-08-24", 5.5],
      ["2026-08-31", 20],
    ])
    expect(trend(list, "year", "2026-01-01", "2026-12-31")[0]).toMatchObject({ expense: 38.5, earning: 1000 })
  })
  it("ranks categories by spending", () => {
    expect(byCategory(list, "2026-08-01", "2026-09-30")).toEqual([
      { category: "food", total: 35.5 },
      { category: "transfer", total: 3 },
    ])
  })
})

describe("recurring projection", () => {
  it("projects one expense a month after the last period, clamped to the month", () => {
    const items = projectRecurring([template({ dayOfMonth: 31, lastPeriod: "2027-01" })], "2027-01-10", 3)
    expect(items.map((i) => i.date)).toEqual(["2027-02-28", "2027-03-31"])
    expect(items[0]).toMatchObject({ source: "finance", basis: "known", amount: 700, category: "home" })
  })
  it("skips days already past, inactive templates and earnings", () => {
    const items = projectRecurring(
      [template({ lastPeriod: "2026-09" }), template({ id: "old", active: false }), template({ id: "pay", type: "earning" })],
      "2026-10-07",
      1
    )
    expect(items.map((i) => i.key)).toEqual(["rent@2026-11-05"])
  })
})

describe("future expenses", () => {
  const deadlines = parseDeadlines(`
[[deadline]]
id = "mortgage"
title = "Mortgage"
area = "home"
date = 2026-10-20
repeat = "monthly"
amount = 650
finance_category = "home"
finance_recurring = "loan"

[[deadline]]
id = "tax"
title = "Car tax"
area = "vehicles"
date = 2026-11-30
repeat = "yearly"
amounts = { "2025-11-30" = 200 }
`)
  const today = "2026-10-04"
  const occurrences = agenda(deadlines, { done: {} }, today)
  const links = deadlines.map((d) => ({ id: d.id, finance_category: d.finance_category, finance_recurring: d.finance_recurring }))

  it("reads the finance fields of deadlines", () => {
    expect(deadlines[0]).toMatchObject({ finance_category: "home", finance_recurring: "loan" })
    expect(deadlines[1]).toMatchObject({ finance_category: null, finance_recurring: null })
  })
  it("merges both sources, leaving out templates a deadline stands for", () => {
    const items = futureExpenses(occurrences, [template(), template({ id: "loan", description: "Loan", amount: 650 })], links, today, 2)
    expect(items.filter((i) => i.source === "finance").map((i) => i.label)).toEqual(["Rent", "Rent"])
    const mortgage = items.find((i) => i.deadline === "mortgage")!
    expect(mortgage).toMatchObject({ source: "deadline", category: "home", basis: "known", amount: 650 })
    expect(items.find((i) => i.deadline === "tax")).toMatchObject({ basis: "estimate", amount: 200 })
    expect(items.map((i) => i.date)).toEqual([...items.map((i) => i.date)].sort())
  })
  it("sums per month by kind", () => {
    const items = futureExpenses(occurrences, [template()], links, today, 2)
    const months = futureByMonth(items, today, 2)
    expect(months.map((m) => m.month)).toEqual(["2026-10", "2026-11", "2026-12"])
    expect(months[0]).toMatchObject({ finance: 700, known: 650, estimate: 0 })
    expect(months[1]).toMatchObject({ finance: 700, known: 650, estimate: 200 })
  })
})

describe("investments", () => {
  const { snapshots, problems } = parseInvestments(`
[[snapshot]]
date = 2026-09-01
broker = "Trade Republic"
cash = 100
source = "inbox/x/shot.jpg"
  [[snapshot.position]]
  name = "MSCI World"
  isin = "IE00B4L5Y983"
  quantity = 10
  value = 1000
  cost = 900

[[snapshot]]
date = 2026-09-15
broker = "Degiro"
  [[snapshot.position]]
  name = "S&P 500"
  value = 500

[[snapshot]]
date = 2026-10-01
broker = "Trade Republic"
cash = 50
  [[snapshot.position]]
  name = "MSCI World"
  value = 1100
  cost = 900

[[snapshot]]
broker = "nameless"
`)

  it("parses snapshots and reports broken ones", () => {
    expect(snapshots).toHaveLength(3)
    expect(snapshots[0].positions[0]).toEqual({ name: "MSCI World", isin: "IE00B4L5Y983", quantity: 10, value: 1000, cost: 900 })
    expect(snapshots[1]).toMatchObject({ cash: 0, source: "" })
    expect(problems).toHaveLength(1)
  })
  it("carries each broker's latest snapshot forward", () => {
    const p = portfolio(snapshots)
    expect(p.history.map((h) => [h.date, h.total])).toEqual([
      ["2026-09-01", 1100],
      ["2026-09-15", 1600],
      ["2026-10-01", 1650],
    ])
    expect(p).toMatchObject({ total: 1650, cash: 50, cost: 900, costedValue: 1100 })
    expect(p.holdings.map((h) => h.name)).toEqual(["MSCI World", "S&P 500"])
  })
})
