import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { PDFDocument, StandardFonts } from "pdf-lib"
import { describe, expect, it } from "vitest"

import { answerForms, filledBlock } from "@autocratico/core"
import { finishAnswer } from "../src/chat-actions.ts"
import { describeForm, readLayout } from "../src/forms.ts"
import { setup } from "./helpers.ts"

const FOLDER = "chats/files/2026-10-26-0a1b2c3d"

/** A flat form like a supplier's data sheet: labels followed by dotted lines, two of them on one line. */
async function flatForm(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([595, 842])
  page.drawText("Ragione Sociale: ..............................................", { x: 36, y: 700, size: 11, font })
  page.drawText("Cap: ....................", { x: 36, y: 670, size: 11, font })
  page.drawText("Città: ..............................", { x: 200, y: 670, size: 11, font })
  page.drawText("DATA", { x: 60, y: 120, size: 11, font })
  return doc.save()
}

/** A fillable form (AcroForm): a text field and a checkbox. */
async function fillableForm(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842])
  const form = doc.getForm()
  form.createTextField("name").addToPage(page, { x: 50, y: 700, width: 200, height: 20 })
  form.createCheckBox("privacy").addToPage(page, { x: 50, y: 650, width: 12, height: 12 })
  return doc.save()
}

function env() {
  const e = setup()
  mkdirSync(join(e.data, FOLDER), { recursive: true })
  return e
}

const deps = (e: ReturnType<typeof env>) => ({ reminders: e.s.reminders, inbox: e.s.inbox, jobs: null, notify: false, locale: "it" as const, changes: null, data: e.data, timeZone: "Europe/Rome" })
const block = (o: unknown) => "Ecco il modulo.\n\n```form\n" + JSON.stringify(o) + "\n```"

describe("forms", () => {
  it("lists a flat form's blanks with the words before them", async () => {
    const e = env()
    writeFileSync(join(e.data, FOLDER, "scheda.pdf"), await flatForm())
    const text = await describeForm(e.data, `${FOLDER}/scheda.pdf`)
    expect(text).toContain("Flat form")
    expect(text).toMatch(/- p1\.1 after "Ragione Sociale:": x \d/)
    expect(text).toMatch(/- p1\.2 after "Cap:"/)
    expect(text).toMatch(/- p1\.3 after "Città:"/)
    await expect(describeForm(e.data, "secrets/auth.db")).rejects.toThrow(/not a PDF/)
    await expect(describeForm(e.data, `${FOLDER}/../../../deadlines.toml`)).rejects.toThrow(/not a PDF/)
  })

  it("writes on the blanks and anywhere asked, in a new PDF beside the chat's files", async () => {
    const e = env()
    const original = await flatForm()
    writeFileSync(join(e.data, FOLDER, "scheda.pdf"), original)
    const answer = await finishAnswer(
      block({
        source: `${FOLDER}/scheda.pdf`,
        fields: [
          { blank: "p1.1", text: "Rossi Servizi di Mario Rossi" },
          { blank: "p1.2", text: "36100" },
          { blank: "p1.3", text: "Vicenza" },
          { page: 1, x: 60, y: 700, text: "26/10/2026" },
          { blank: "p1.9", text: "nowhere" },
          { page: 1, text: "no place" },
        ],
      }),
      "web",
      "owner",
      deps(e)
    )
    expect(answer.startsWith("Ecco il modulo.")).toBe(true)
    expect(answer).not.toContain("```form")
    const [form] = answerForms(answer)
    expect(form).toMatchObject({ name: "scheda - compilato.pdf", pages: 1, filled: 4 })
    expect(form.path).toMatch(/^chats\/files\/\d{4}-\d{2}-\d{2}-[0-9a-f]{8}\/scheda - compilato\.pdf$/)
    expect(answer).toContain("⚠️ Modulo: no blank p1.9")
    expect(answer).toContain("⚠️ Modulo: needs field, blank, or page, x and y")

    const layout = await readLayout(new Uint8Array(readFileSync(join(e.data, form.path))))
    const words = layout.pages[0].runs.map((r) => r.text)
    expect(words).toEqual(expect.arrayContaining(["Rossi Servizi di Mario Rossi", "36100", "Vicenza", "26/10/2026"]))
    // Written on the line of its label, after it.
    const cap = layout.pages[0].runs.find((r) => r.text === "36100")!
    expect(Math.round(cap.y)).toBe(842 - 670)
    expect(cap.x).toBeGreaterThan(36 + 20)
    // The original stays as it was.
    expect(new Uint8Array(readFileSync(join(e.data, FOLDER, "scheda.pdf")))).toEqual(original)
  })

  it("fills a fillable form's fields by name", async () => {
    const e = env()
    writeFileSync(join(e.data, FOLDER, "domanda.pdf"), await fillableForm())
    expect(await describeForm(e.data, `${FOLDER}/domanda.pdf`)).toContain('- "name" text (page 1)')
    const answer = await finishAnswer(
      block({ source: `${FOLDER}/domanda.pdf`, fields: [{ field: "name", value: "Mario Rossi" }, { field: "privacy", value: true }, { field: "missing", value: "x" }] }),
      "web",
      "owner",
      deps(e)
    )
    const [form] = answerForms(answer)
    expect(form.filled).toBe(2)
    expect(answer).toContain('⚠️ Modulo: no field "missing"')
    const filled = (await PDFDocument.load(readFileSync(join(e.data, form.path)))).getForm()
    expect(filled.getTextField("name").getText()).toBe("Mario Rossi")
    expect(filled.getCheckBox("privacy").isChecked()).toBe(true)
  })

  it("fills only PDFs of the chat, the inbox or the archive, and only from the web app", async () => {
    const e = env()
    writeFileSync(join(e.data, FOLDER, "scheda.pdf"), await flatForm())
    const fields = [{ blank: "p1.1", text: "x" }]
    let answer = await finishAnswer(block({ source: "secrets/form.pdf", fields }), "web", "owner", deps(e))
    expect(answer).toContain("⚠️ Modulo non compilato: not a PDF in chats/files/, inbox/ or archive/")
    expect(answerForms(answer)).toEqual([])
    answer = await finishAnswer(block({ source: `${FOLDER}/scheda.pdf`, fields }), "telegram", "owner", deps(e))
    expect(answer).toContain("I moduli si compilano nell'app web")
    expect(answerForms(answer)).toEqual([])
  })

  it("deletes the forms filled in a chat with it", async () => {
    const e = env()
    const out = "chats/files/2026-10-26-99999999"
    mkdirSync(join(e.data, out), { recursive: true })
    writeFileSync(join(e.data, out, "scheda - compilato.pdf"), "%PDF-1.4")
    const chat = e.s.store.newChat("web")
    chat.messages.push({ role: "user", text: "compila", tools: [] })
    chat.messages.push({ role: "assistant", text: `Fatto.\n\n${filledBlock({ path: `${out}/scheda - compilato.pdf`, name: "scheda - compilato.pdf", pages: 1, filled: 3 })}`, tools: [] })
    await e.s.store.saveChat(chat)
    expect(e.s.store.deleteChat(chat.id)).toBe(true)
    expect(existsSync(join(e.data, out))).toBe(false)
  })
})
