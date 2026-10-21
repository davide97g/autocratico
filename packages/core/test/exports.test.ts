import { describe, expect, it } from "vitest"

import { exportFileName, queryTable, SandboxMessage, tableCsv, tableJson } from "../src/index.ts"

const PNG = "data:image/png;base64,iVBORw0KGgo="

describe("export answers from the sandbox", () => {
  it("keeps a table and a picture that check out", () => {
    const r = SandboxMessage.safeParse({ type: "export", id: "abc-1", table: { columns: ["a", "b"], rows: [["x", 1], [null, true]] }, picture: { png: PNG, width: 10, height: 5 } })
    expect(r.success && r.data.type === "export" && r.data.table?.rows.length).toBe(2)
    expect(r.success && r.data.type === "export" && r.data.picture?.width).toBe(10)
  })

  it("drops the parts that do not, keeping the answer", () => {
    const r = SandboxMessage.safeParse({
      type: "export",
      id: "abc-1",
      table: { columns: ["a"], rows: [[{ nested: 1 }]] },
      picture: { png: "data:image/svg+xml;base64,PHN2Zz4=", width: 10, height: 5 },
      extra: "ignored",
    })
    expect(r.success).toBe(true)
    if (r.success && r.data.type === "export") {
      expect(r.data.table).toBeNull()
      expect(r.data.picture).toBeNull()
      expect("extra" in r.data).toBe(false)
    }
  })

  it("refuses an answer without a proper id, and too many columns", () => {
    expect(SandboxMessage.safeParse({ type: "export", id: "../x", table: null, picture: null }).success).toBe(false)
    const wide = SandboxMessage.safeParse({ type: "export", id: "a", table: { columns: Array.from({ length: 41 }, (_, i) => `c${i}`), rows: [] } })
    expect(wide.success && wide.data.type === "export" && wide.data.table).toBeNull()
  })
})

describe("queryTable", () => {
  it("is the rows of one query, one column per field", () => {
    const t = queryTable({ due: [{ title: "Car tax", amount: 180.5 }, { title: "TARI", amount: null, brokers: { a: 1 } }] })
    expect(t.columns).toEqual(["title", "amount", "brokers"])
    expect(t.rows).toEqual([
      ["Car tax", 180.5, null],
      ["TARI", null, '{"a":1}'],
    ])
  })

  it("names the query when there are several, and leaves out data not available", () => {
    const t = queryTable({ a: [{ x: 1 }], b: [{ y: 2 }], finance: null })
    expect(t.columns).toEqual(["data", "x", "y"])
    expect(t.rows).toEqual([
      ["a", 1, null],
      ["b", null, 2],
    ])
  })
})

describe("tableCsv", () => {
  const table = { columns: ["category", "total"], rows: [["Casa; affitto", 1234.5], ['He said "hi"', -3], ["=HYPERLINK(\"x\")", null], ["+39 333", true]] }

  it("writes Italian CSV with ; and a decimal comma, BOM and CRLF", () => {
    const csv = tableCsv(table, "it")
    expect(csv.startsWith("﻿category;total\r\n")).toBe(true)
    expect(csv).toContain('"Casa; affitto";1234,5\r\n')
    expect(csv).toContain('"He said ""hi""";-3\r\n')
  })

  it("writes English CSV with , and a dot", () => {
    expect(tableCsv({ columns: ["a", "b"], rows: [["x,y", 1.5]] }, "en")).toBe('﻿a,b\r\n"x,y",1.5\r\n')
  })

  it("never lets a text cell become a formula", () => {
    const csv = tableCsv(table, "it")
    expect(csv).toContain(`"'=HYPERLINK(""x"")";\r\n`)
    expect(csv).toContain("'+39 333;true\r\n")
  })
})

describe("tableJson and file names", () => {
  it("writes one object per row", () => {
    const json = JSON.parse(tableJson({ columns: ["a", "b"], rows: [[1, "x"]] }, { title: "T", date: "2026-10-21", privacy: true }))
    expect(json).toEqual({ title: "T", exported: "2026-10-21", privacy: true, rows: [{ a: 1, b: "x" }] })
  })

  it("names the file after the widget and the day", () => {
    expect(exportFileName("spese-lego", "2026-10-21", "pdf")).toBe("spese-lego-2026-10-21.pdf")
    expect(exportFileName("../../etc", "2026-10-21", "csv")).toBe("etc-2026-10-21.csv")
  })
})
