import { describe, expect, it } from "vitest"

import {
  addMonths,
  agenda,
  daysBetween,
  documentRefs,
  isDocumentPath,
  fileName,
  gmailLinks,
  level,
  parseDeadlines,
  parseWhatsAppExport,
  payments,
  redact,
  reminders,
  slug,
  today,
  withoutGmailLinks,
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

describe("amounts", () => {
  const toml = `
[[deadline]]
id = "fee"
title = "Fee"
area = "home"
date = 2026-01-15
repeat = "every 3 months"
amount = 100

[[deadline]]
id = "bill"
title = "Bill"
area = "home"
date = 2025-10-20
repeat = "monthly"
amounts = { "2025-10-20" = 30.0, "2026-04-20" = 50.0, "2026-08-20" = 70.5, "2026-10-20" = 41 }

[[deadline]]
id = "insurance"
title = "Insurance"
area = "vehicles"
date = 2027-02-10
repeat = "yearly"
amount = "TODO"

[[deadline]]
id = "service"
title = "Service"
area = "home"
date = 2026-11-30
repeat = "yearly"
`
  const paid = ["fee@2026-07-15", "fee@2026-10-15", "bill@2026-06-20", "bill@2026-07-20", "bill@2026-08-20"]
  const items = agenda(parseDeadlines(toml), { done: Object.fromEntries(paid.map((k) => [k, "2026-10-01"])) }, "2026-10-04")
  const on = (key: string) => items.find((o) => o.key === key)

  it("resolves known, estimated and unknown amounts", () => {
    expect(on("fee@2027-01-15")).toMatchObject({ amount: 100, amount_basis: "known" })
    expect(on("bill@2026-10-20")).toMatchObject({ amount: 41, amount_basis: "known" })
    // the year up to the latest amount recorded before it: 50, 70.5 and 41 (30 is a year older)
    expect(on("bill@2026-11-20")).toMatchObject({ amount: 53.83, amount_basis: "estimate" })
    expect(on("insurance@2027-02-10")).toMatchObject({ amount: null, amount_basis: "unknown" })
    expect(on("service@2026-11-30")).toMatchObject({ amount: null, amount_basis: null })
  })

  it("sums what is left to pay over the next months", () => {
    const p = payments(items, "2026-10-04", 3)
    expect(p.end).toBe("2027-01-04")
    // overdue September bill (estimated from the year before it), October bill, Nov and Dec estimates
    expect(p.items.map((o) => o.key)).toEqual(["bill@2026-09-20", "bill@2026-10-20", "bill@2026-11-20", "bill@2026-12-20"])
    expect(p).toMatchObject({ known: 41, estimated: cents(on("bill@2026-09-20")!.amount! + 53.83 * 2), unknown: 0 })
    expect(p.overdue).toBe(on("bill@2026-09-20")!.amount)
    expect(payments(items, "2026-10-04", 6)).toMatchObject({ unknown: 1 })
  })

  it("rejects bad amounts", () => {
    expect(() => parseDeadlines(toml.replace('"TODO"', '"soon"'))).toThrow(/amount must be/)
    expect(() => parseDeadlines(toml.replace('"2025-10-20" = 30.0', '"Oct" = 30.0'))).toThrow(/amounts must be/)
  })
})

const cents = (n: number) => Math.round(n * 100) / 100

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

  it("keeps the confirm block for the clients' yes/no buttons and hides it", async () => {
    const { asksToConfirm, extractActions, stripActions } = await import("../src/index.ts")
    const answer = "Chiudo «Contabo» con until oggi. Confermi?\n\n```confirm\n```"
    expect(asksToConfirm(answer)).toBe(true)
    expect(stripActions(answer)).toBe("Chiudo «Contabo» con until oggi. Confermi?")
    expect(stripActions("Confermi?\n```conf")).toBe("Confermi?") // mid-stream
    const { text } = extractActions(answer)
    expect(asksToConfirm(text)).toBe(true)
    expect(stripActions(text)).toBe(stripActions(answer))
    expect(asksToConfirm("Fatto.")).toBe(false)
    // A confirm word inside a change block is not a confirm block.
    expect(asksToConfirm('```change\n{"summary":"```confirm```","ops":[]}\n```')).toBe(false)
  })

  it("splits the server's confirmation lines from the answer", async () => {
    const { splitConfirmations } = await import("../src/index.ts")
    const answer = "Sposto la data.\n\n✏️ Registro aggiornato: Bollo al 30/09/2027 (modifica 55cb507, annullabile da Attività)\n📥 Aggiunto all'inbox: TARI."
    const { text, confirmations } = splitConfirmations(answer)
    expect(text).toBe("Sposto la data.")
    expect(confirmations).toEqual([
      { kind: "change", text: "Registro aggiornato: Bollo al 30/09/2027", hash: "55cb507" },
      { kind: "inbox", text: "Aggiunto all'inbox: TARI.", hash: null },
    ])
    expect(splitConfirmations("⚠️ Change not applied: unknown id").confirmations[0].kind).toBe("warning")
    // A last paragraph that is not only confirmations stays text.
    expect(splitConfirmations("Ok.\n\n⏰ soon\nmore").confirmations).toEqual([])
  })

  it("reads reminder times in the deadlines' time zone", async () => {
    const { reminderTime, localNow } = await import("../src/index.ts")
    const now = new Date("2026-10-03T13:40:00Z")
    expect(reminderTime("2026-10-03T17:05", "Europe/Rome", now)).toBe("2026-10-03T15:05:00.000Z")
    expect(reminderTime("2026-12-01T09:00", "Europe/Rome", now)).toBe("2026-12-01T08:00:00.000Z") // winter time
    expect(reminderTime("2026-10-03T16:05:00+02:00", "Europe/Rome", now)).toBe("2026-10-03T14:05:00.000Z")
    expect(reminderTime("2026-10-02T09:00", "Europe/Rome", now)).toBeNull()
    expect(reminderTime("tomorrow", "Europe/Rome", now)).toBeNull()
    expect(localNow("Europe/Rome", now)).toBe("2026-10-03 15:40 Saturday (UTC+02:00)")
  })
})

describe("documents", () => {
  it("finds the original files a case mentions", () => {
    const md = "- 2026-10-03: lettera (`inbox/2026-10-03-upload-x-1a2b3c/`), F24 in archive/2026/casa/f24.pdf.\n- inbox/../secrets/x, inbox/a/item.json"
    expect(documentRefs(md)).toEqual(["inbox/2026-10-03-upload-x-1a2b3c/", "archive/2026/casa/f24.pdf"])
  })

  it("accepts only paths inside inbox/ and archive/", () => {
    expect(isDocumentPath("archive/email/x/message.md")).toBe(true)
    expect(isDocumentPath("secrets/token.json")).toBe(false)
    expect(isDocumentPath("inbox/.hidden/a.jpg")).toBe(false)
    expect(isDocumentPath("archive")).toBe(false)
  })
})

describe("first-run datasets", () => {
  it("loads the empty template and the example", async () => {
    const { resolve } = await import("node:path")
    const { loadData } = await import("../src/node.ts")
    const root = resolve(import.meta.dirname, "../../..")
    const empty = loadData(resolve(root, "template"), "2026-10-04")
    expect(empty.agenda).toEqual([])
    expect(empty.cases).toEqual([])
    expect(empty.profile).toEqual({})
    expect(loadData(resolve(root, "example"), "2026-10-04").agenda.length).toBeGreaterThan(0)
  })
})

describe("Gmail links", () => {
  const web = "https://mail.google.com/mail/u/0/#inbox/FMfcgzQcqHbhCqwDnCNJKsrwkgKScRpp"
  it("finds links that name a conversation", () => {
    expect(gmailLinks(`Guarda (${web}). E questa: https://mail.google.com/mail/u/1/#all/199e22cd1b5badb3, grazie`)).toEqual([
      web,
      "https://mail.google.com/mail/u/1/#all/199e22cd1b5badb3",
    ])
    expect(gmailLinks("https://mail.google.com/mail/u/0/?ik=a1&view=om&permmsgid=msg-f:1845951161591115187")).toHaveLength(1)
    expect(gmailLinks(`${web} ${web}`)).toEqual([web])
    // Gmail pages that are not one email, and other sites.
    expect(gmailLinks("https://mail.google.com/mail/u/0/#inbox https://mail.google.com/mail/u/0/#label/Agenzia-Entrate")).toEqual([])
    expect(gmailLinks("https://example.com/mail/u/0/#inbox/FMfcgzQcqHbhCqwDnCNJKsrwkgKScRpp")).toEqual([])
  })
  it("leaves the rest of the message for the bubble", () => {
    expect(withoutGmailLinks(`Cos'è?\n\n${web}\n\n`)).toBe("Cos'è?")
    expect(withoutGmailLinks(web)).toBe("")
  })
})
