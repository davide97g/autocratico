import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

import { InboxItem } from "@autocratico/core"
import { describe, expect, it } from "vitest"

import type { Claude } from "../src/claude.ts"
import { Jobs, parseTriage } from "../src/jobs.ts"
import { analysis, parseReports, readChecks } from "../src/phishing.ts"
import { owner, post, setup } from "./helpers.ts"

const ROOT = resolve(import.meta.dirname, "../../..")

/** scripts/phishing.py evidence() on (headers, html, text, attachments), as its JSON. */
function evidence(headers: [string, string][], html: string | null, text: string, attachments: string[] = []) {
  const code = "import json, sys, phishing; a = json.loads(sys.argv[1]); print(json.dumps(phishing.evidence(*a)))"
  return JSON.parse(execFileSync("python3", ["-c", code, JSON.stringify([headers, html, text, attachments])], { cwd: join(ROOT, "scripts"), encoding: "utf8" }))
}

const FAKE: [string, string][] = [
  ["From", "Agenzia Entrate Rimborsi <noreply@agenzia-entrate-servizi.info>"],
  ["Reply-To", "rimborsi.ufficio@gmail.com"],
  ["Subject", "Rimborso fiscale in attesa"],
  ["Authentication-Results", "mx.google.com; spf=softfail smtp.mailfrom=x; dkim=none; dmarc=fail (p=NONE)"],
]
const FAKE_HTML = '<p>Confermi i dati della carta entro 48 ore: <a href="https://agenziaentrate-rimborsi.top/login">www.agenziaentrate.gov.it</a></p>'
const FAKE_TEXT = "Gentile contribuente, risulta un rimborso di 284,60 euro in attesa. Confermi i dati della carta entro 48 ore, altrimenti il rimborso sarà annullato."

describe("phishing checks (scripts/phishing.py)", () => {
  it("finds a fake sender, a link that lies about where it goes, urgency and a request for card data", () => {
    const r = evidence(FAKE, FAKE_HTML, FAKE_TEXT, ["avviso.html"])
    const codes = r.signals.map((s: { code: string }) => s.code)
    expect(codes).toEqual(
      expect.arrayContaining(["dmarc_fail", "impersonation", "reply_to_mismatch", "link_mismatch", "link_lookalike", "link_not_official", "urgency", "card_data", "risky_attachment"])
    )
    expect(r.risk).toBe("high")
    expect(r.auth).toEqual({ spf: "softfail", dkim: "none", dmarc: "fail" })
    expect(r.from.domain).toBe("agenzia-entrate-servizi.info")
    expect(r.reply_to).toBe("gmail.com")
    expect(r.links[0]).toMatchObject({ text: "www.agenziaentrate.gov.it", domain: "agenziaentrate-rimborsi.top" })
    expect(r.links[0].flags).toEqual(expect.arrayContaining(["mismatch", "lookalike", "odd_tld"]))
    // The evidence is the email's own sentence, so the web app can find it in the text.
    const card = r.signals.find((s: { code: string }) => s.code === "card_data")
    expect(FAKE_TEXT).toContain(card.evidence)
  })

  it("finds nothing in a genuine message from a public body", () => {
    const r = evidence(
      [
        ["From", "Agenzia delle Entrate <noreply@agenziaentrate.gov.it>"],
        ["Authentication-Results", "mx.google.com; spf=pass; dkim=pass; dmarc=pass"],
        ["Subject", "Comunicazione"],
      ],
      '<a href="https://www.agenziaentrate.gov.it/portale">area riservata</a>',
      "È disponibile una comunicazione nella sua area riservata. Scade il 16 dicembre."
    )
    expect(r).toMatchObject({ risk: "none", signals: [] })
    // Agenzia delle Entrate-Riscossione is not a lookalike of Agenzia delle Entrate.
    expect(evidence([["From", "AdER <x@agenziaentrateriscossione.gov.it>"]], null, "https://www.agenziaentrateriscossione.gov.it/it/").risk).toBe("none")
  })
})

describe("phishing reports", () => {
  it("reads the agent's entries: objects with their reasons, or bare ids", () => {
    const r = parseTriage(
      '```json\n{"items":[],"summary":"","phishing":["a",{"id":"b","risk":"high","verdict":"Falso rimborso","signals":[{"kind":"sender","severity":"high","evidence":"x@y.info","why":"Non è il dominio"},{"kind":"weird","severity":"??"}]},{"risk":"high"}]}\n```'
    )
    expect(r?.phishing).toHaveLength(2)
    expect(r?.phishing[0]).toMatchObject({ id: "a", risk: null, signals: [] })
    expect(r?.phishing[1].signals).toEqual([
      { kind: "sender", severity: "high", evidence: "x@y.info", why: "Non è il dominio" },
      { kind: "other", severity: "medium", evidence: "", why: "" },
    ])
    expect(parseReports("nope")).toEqual([])
  })

  it("takes the risk from the checks when the agent gave only the id", () => {
    const [report] = parseReports(["a"])
    const found = analysis(report, { risk: "high", checks: { auth: { spf: "", dkim: "", dmarc: "fail" }, from: { name: "", address: "", domain: "" }, reply_to: "", return_path: "", links: [], partial: false }, signals: [] })
    expect(found).toMatchObject({ risk: "high", verdict: "", dismissed: "" })
    expect(analysis(report, null).risk).toBe("medium")
  })
})

describe("phishing in the inbox", () => {
  const FOLDER = "2026-10-20-rimborso-fiscale-in-attesa-abc123"

  function withFlaggable() {
    const ctx = setup()
    const email = join(ctx.data, "archive", "email", FOLDER)
    mkdirSync(email, { recursive: true })
    writeFileSync(join(email, "message.md"), `---\nid: abc123\nfrom: ${JSON.stringify(FAKE[0][1])}\nsubject: "Rimborso fiscale in attesa"\nattachments: []\n---\n\n${FAKE_TEXT}\n`)
    writeFileSync(join(email, "checks.json"), JSON.stringify(evidence(FAKE, FAKE_HTML, FAKE_TEXT)))
    const item = join(ctx.data, "inbox", "2026-10-20-email-rimborso-abc123")
    mkdirSync(item, { recursive: true })
    writeFileSync(join(item, "content.md"), `Email in archive/email/${FOLDER}/message.md\n`)
    writeFileSync(
      join(item, "item.json"),
      JSON.stringify({ id: "p1", source: "email", status: "new", received: "2026-10-20T10:00:00Z", title: "Rimborso fiscale in attesa", from: FAKE[0][1], ref: `archive/email/${FOLDER}`, important: true })
    )
    return ctx
  }

  it("keeps the agent's reasons with the checks, tells the phone, and shows them with the email", async () => {
    const { s, app, data } = withFlaggable()
    const prompts: string[] = []
    const sent: string[] = []
    const report = { id: "p1", risk: "high", verdict: "Finto rimborso dell'Agenzia delle Entrate.", advice: "Non aprire il link.", signals: [{ kind: "context", severity: "medium", evidence: "rimborso di 284,60 euro", why: "Nessun rimborso atteso nel registro" }] }
    const claude = {
      available: true,
      complete: async (o: { prompt: string }) => {
        prompts.push(o.prompt)
        return { text: "```json\n" + JSON.stringify({ items: [{ id: "p1", status: "processed", outcome: "Phishing" }], summary: "", phishing: [report] }) + "\n```", session: null, error: null }
      },
    } as unknown as Claude
    const notifier = () => ({ notify: async (text: string) => void sent.push(text) })
    const jobs = new Jobs({ config: s.config, store: s.store, inbox: s.inbox, claude, repo: s.repo, reminders: s.reminders, finance: s.finance, notifier })
    expect((await jobs.trigger("triage")).ok).toBe(true)

    expect(prompts[0]).toContain(`checks: archive/email/${FOLDER}/checks.json (risk high)`)
    const item = s.inbox.list().find((i) => i.id === "p1")!
    expect(item.phishing).toMatchObject({ risk: "high", verdict: report.verdict, advice: report.advice, dismissed: "" })
    expect(item.phishing!.signals[0]).toMatchObject({ kind: "context", source: "agent", code: "" })
    expect(item.phishing!.signals.some((x) => x.source === "check" && x.code === "link_mismatch")).toBe(true)
    expect(item.phishing!.checks?.links[0].domain).toBe("agenziaentrate-rimborsi.top")
    expect(sent[0]).toContain("Possibile phishing (rischio alto): Rimborso fiscale in attesa\nFinto rimborso")

    const me = await owner(app)
    const source = (await (await app.request(`/api/source?path=archive/email/${FOLDER}`, { headers: me })).json()) as { files: string[] }
    expect(source).toMatchObject({ phishing: { risk: "high" }, phishingItem: "p1" })
    expect(source.files).not.toContain(`archive/email/${FOLDER}/checks.json`)
    const archive = (await (await app.request("/api/archive", { headers: me })).json()) as { path: string; phishing: unknown }[]
    expect(archive.find((a) => a.path === `archive/email/${FOLDER}`)?.phishing).toEqual({ risk: "high", dismissed: false })

    // "Not phishing": kept, marked dismissed; and back.
    expect((await post(app, "/api/inbox/p1/phishing", { dismissed: true }, me)).status).toBe(200)
    const saved = InboxItem.parse({ ...JSON.parse(readFileSync(join(data, "inbox", "2026-10-20-email-rimborso-abc123", "item.json"), "utf8")), folder: "x" })
    expect(saved.phishing?.dismissed).not.toBe("")
    expect(saved.phishing?.verdict).toBe(report.verdict)
    expect((await post(app, "/api/inbox/p1/phishing", { dismissed: false }, me)).status).toBe(200)
    expect(s.inbox.list().find((i) => i.id === "p1")!.phishing?.dismissed).toBe("")
  })

  it("refuses to dismiss an item that was never flagged, and reads checks only from archive/email", async () => {
    const { app, data } = withFlaggable()
    const me = await owner(app)
    expect((await post(app, "/api/inbox/p1/phishing", { dismissed: true }, me)).status).toBe(400)
    expect((await post(app, "/api/inbox/nope/phishing", { dismissed: true }, me)).status).toBe(400)
    expect(readChecks(data, `archive/email/${FOLDER}`)?.risk).toBe("high")
    expect(readChecks(data, "archive/email/../../secrets")).toBeNull()
    expect(readChecks(data, "inbox/x")).toBeNull()
  })
})
