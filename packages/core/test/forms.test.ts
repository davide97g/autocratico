import { describe, expect, it } from "vitest"

import { answerForms, filledBlock, findBlanks, formBlocks, layoutText, stripActions, type TextRun } from "../src/index.ts"

const run = (x: number, y: number, text: string, w: number, size = 10): TextRun => ({ x, y, w, size, text })

describe("form layout", () => {
  it("finds the blanks of a flat form, labelled by the words before them", () => {
    const page = {
      width: 595,
      height: 842,
      runs: [
        // A label split in two runs, then its dots.
        run(36, 230, "Ragione Sociale", 77),
        run(113, 230, ":", 4),
        run(120, 230, "……..........................", 400),
        // Two blanks on one line, the second right after its label in the same run.
        run(36, 285, "Cap:", 22),
        run(61, 285, "……………", 88),
        run(153, 285, "Città: ........................", 300),
        // Dots split in two runs: one blank.
        run(36, 320, "PEC:", 28),
        run(68, 320, "…......", 100),
        run(170, 320, "………..", 100),
        // Ordinary text has no blanks.
        run(36, 400, "Per una corretta gestione anagrafica e fiscale.", 300),
      ],
    }
    const blanks = findBlanks([page])
    expect(blanks.map((b) => [b.id, b.label])).toEqual([
      ["p1.1", "Ragione Sociale:"],
      ["p1.2", "Cap:"],
      ["p1.3", "Città:"],
      ["p1.4", "PEC:"],
    ])
    expect(blanks[0]).toMatchObject({ page: 1, x: 120, y: 230, w: 400 })
    // The dots start after "Città: ", not over it.
    expect(blanks[2].x).toBeGreaterThan(153 + 25)
    expect(blanks[3]).toMatchObject({ x: 68, w: 202 })

    const text = layoutText([page, { width: 595, height: 842, runs: [] }], [])
    expect(text).toContain('- p1.1 after "Ragione Sociale:": x 120–520, y 230')
    expect(text).toContain("## Page 2 (595 x 842 pt)\nNo text on this page")
  })

  it("lists a fillable form's fields", () => {
    const text = layoutText([{ width: 595, height: 842, runs: [] }], [
      { name: "Nome", type: "text", page: 1 },
      { name: "Tipo", type: "radio", page: 1, options: ["A", "B"], value: "A" },
    ])
    expect(text).toContain("Fillable form: 2 fields")
    expect(text).toContain('- "Tipo" radio (page 1) options: "A", "B" now: "A"')
  })
})

describe("form blocks", () => {
  it("reads the entries and says which cannot be used", () => {
    const [b] = formBlocks(
      "Ecco.\n\n```form\n" +
        JSON.stringify({
          source: "chats/files/2026-10-26-0a1b2c3d/f.pdf",
          fields: [
            { blank: "p1.2", text: "36100", size: 8 },
            { field: "Nome", value: "Mario" },
            { field: "Privacy", value: true },
            { page: 2, x: 80, y: 700, text: "26/10/2026", mask: true },
            { page: 1, x: 50, y: 300, check: true },
            { blank: "nope", text: "x" },
            { page: 1, x: 10, text: "no y" },
            { blank: "p1.3" },
          ],
        }) +
        "\n```"
    )
    if ("error" in b) throw new Error(b.error)
    expect(b.request.fields).toEqual([
      { kind: "blank", blank: "p1.2", text: "36100", size: 8, mask: undefined },
      { kind: "field", field: "Nome", value: "Mario" },
      { kind: "field", field: "Privacy", value: true },
      { kind: "text", page: 2, x: 80, y: 700, text: "26/10/2026", size: undefined, mask: true },
      { kind: "check", page: 1, x: 50, y: 300, size: undefined },
    ])
    expect(b.errors).toHaveLength(3)
    expect(formBlocks("```form\nnot json\n```")).toEqual([{ error: "not JSON" }])
  })

  it("hides form blocks from the text and keeps the filled PDFs for the web app", () => {
    const filled = filledBlock({ path: "chats/files/2026-10-26-0a1b2c3d/f - compilato.pdf", name: "f - compilato.pdf", pages: 2, filled: 20 })
    const answer = `Compilato.\n\n\`\`\`form\n{"source": "x"}\n\`\`\`\n\n${filled}`
    expect(stripActions(answer)).toBe("Compilato.")
    expect(stripActions("Compilo.\n\n```form\n{\"sour")).toBe("Compilo.")
    // Another language's code block is not one of ours.
    expect(stripActions("```formula\nx\n```")).toBe("```formula\nx\n```")
    expect(answerForms(answer)).toEqual([{ path: "chats/files/2026-10-26-0a1b2c3d/f - compilato.pdf", name: "f - compilato.pdf", pages: 2, filled: 20 }])
    // Only PDFs among the chat's files.
    expect(answerForms('```filled\n{"path": "secrets/auth.db", "name": "x"}\n```')).toEqual([])
  })
})
