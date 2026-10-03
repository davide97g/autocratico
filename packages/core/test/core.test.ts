import { describe, expect, it } from "vitest"

import {
  addMonths,
  agenda,
  daysBetween,
  fileName,
  level,
  parseDeadlines,
  parseWhatsAppExport,
  redact,
  reminders,
  slug,
  today,
} from "../src/index.ts"

describe("dates", () => {
  it("clamps to the end of the month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28")
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29")
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15")
  })
  it("counts days across DST changes", () => {
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2)
    expect(daysBetween("2026-10-30", "2026-10-24")).toBe(-6)
  })
  it("gives today's date in Rome", () => {
    expect(today("Europe/Rome", new Date("2026-10-03T22:30:00Z"))).toBe("2026-10-04")
  })
})

describe("deadlines", () => {
  const toml = `
[[deadline]]
id = "a"
title = "A"
area = "tax"
date = 2026-10-10
repeat = "yearly"
severity = "high"
remind_days = [7, 3]
`
  it("rejects bad data", () => {
    expect(() => parseDeadlines(`${toml}\n${toml}`)).toThrow(/duplicate/)
    expect(() => parseDeadlines(toml.replace('"yearly"', '"weekly"'))).toThrow(/repeat/)
    expect(() => parseDeadlines(toml.replace('"high"', '"huge"'))).toThrow(/severity/)
  })
  it("computes reminders", () => {
    const d = parseDeadlines(toml)
    expect(reminders(d, { done: {} }, "2026-10-03").due.map((o) => o.key)).toEqual(["a@2026-10-10"])
    expect(reminders(d, { done: {} }, "2026-10-04").due).toEqual([])
    expect(reminders(d, { done: {} }, "2026-10-12").overdue.map((o) => o.key)).toEqual(["a@2026-10-10"])
    expect(reminders(d, { done: { "a@2026-10-10": "2026-10-09" } }, "2026-10-12").overdue).toEqual([])
  })
  it("assigns levels", () => {
    const [o] = agenda(parseDeadlines(toml), { done: {} }, "2026-10-03")
    expect(level(o)).toBe("urgent")
  })
})

describe("redact", () => {
  it("masks marked and recognisable personal data", () => {
    const out = redact("Bollo ||€ 180,00|| per AB123CD, IBAN IT60X0542811101000000123456, CF RSSMRA80A01H501U, 1.234,56 €, mario@example.com")
    expect(out).not.toMatch(/180|IT60|RSSMRA|1\.234|mario@/)
    expect(out).toContain("Bollo")
  })
  it("keeps ordinary text and dates", () => {
    expect(redact("Scadenza 2026-10-10 tra 7 giorni")).toBe("Scadenza 2026-10-10 tra 7 giorni")
  })
})

describe("names", () => {
  it("builds safe names", () => {
    expect(slug("Avviso di pagamento: TARI 2026!")).toBe("avviso-di-pagamento-tari-2026")
    expect(slug("***")).toBe("untitled")
    expect(fileName("../../etc/passwd", [])).toBe("_.._etc_passwd")
    expect(fileName("a.pdf", ["a.pdf"])).toBe("a-2.pdf")
    expect(fileName("item.json", [])).toBe("item-2.json")
  })
})

describe("whatsapp", () => {
  it("parses iOS exports", () => {
    const chat = parseWhatsAppExport(
      "[03/10/26, 14:05:12] Mario: Ciao\nseconda riga\n[03/10/26, 14:06:00] Anna: ‎<allegato: 00000012-PHOTO-2026-10-03.jpg>\n[03/10/26, 14:07:00] I messaggi sono crittografati."
    )
    expect(chat.participants).toEqual(["Mario", "Anna"])
    expect(chat.messages[0]).toEqual({ at: "2026-10-03T14:05:12", author: "Mario", text: "Ciao\nseconda riga", attachment: null })
    expect(chat.messages[1].attachment).toBe("00000012-PHOTO-2026-10-03.jpg")
    expect(chat.messages[2].author).toBe("")
  })
  it("parses Android exports", () => {
    const chat = parseWhatsAppExport("03/10/2026, 09:15 - Mario: Bolletta\n03/10/2026, 09:16 - Mario: IMG-1.jpg (file allegato)")
    expect(chat.messages.map((m) => m.at)).toEqual(["2026-10-03T09:15", "2026-10-03T09:16"])
    expect(chat.messages[1].attachment).toBe("IMG-1.jpg")
  })
})

describe("chat actions", () => {
  it("extracts reminder and inbox blocks and hides them", async () => {
    const { extractActions, stripActions } = await import("../src/index.ts")
    const answer = 'Va bene, te lo ricordo.\n\n```reminder\n{"at":"2026-10-03T17:05","text":"Inserire la TARI"}\n```\n```inbox\n{"title":"TARI","text":"Avviso ricevuto, scade il 16/10"}\n```'
    const { text, actions } = extractActions(answer)
    expect(text).toBe("Va bene, te lo ricordo.")
    expect(actions.reminders).toEqual([{ at: "2026-10-03T17:05", text: "Inserire la TARI" }])
    expect(actions.inbox[0].title).toBe("TARI")
    expect(stripActions('Ok\n```reminder\n{"at":"2026-')).toBe("Ok")
    expect(extractActions("```reminder\nnot json\n```").actions.reminders).toEqual([])
  })

  it("reads reminder times in the deadlines' time zone", async () => {
    const { reminderTime, localNow } = await import("../src/index.ts")
    const now = new Date("2026-10-03T13:40:00Z")
    expect(reminderTime("2026-10-03T17:05", "Europe/Rome", now)).toBe("2026-10-03T15:05:00.000Z")
    expect(reminderTime("2026-12-01T09:00", "Europe/Rome", now)).toBe("2026-12-01T08:00:00.000Z") // winter time
    expect(reminderTime("2026-10-03T16:05:00+02:00", "Europe/Rome", now)).toBe("2026-10-03T14:05:00.000Z")
    expect(reminderTime("2026-10-02T09:00", "Europe/Rome", now)).toBeNull()
    expect(reminderTime("tomorrow", "Europe/Rome", now)).toBeNull()
    expect(localNow("Europe/Rome", now)).toBe("2026-10-03 15:40 (UTC+02:00)")
  })
})
