/**
 * Phishing analysis of emails: the background agent flags an item in its result block with its
 * reasons, and the server stores them in the item together with the fixed checks that
 * scripts/phishing.py wrote beside the message (archive/email/<folder>/checks.json). The web app
 * shows both; nothing here opens a link or looks a domain up.
 */
import { readFileSync, realpathSync } from "node:fs"
import { join, sep } from "node:path"

import { EmailChecks, PHISHING_KINDS, type PhishingAnalysis, PhishingRisk, type PhishingSignal } from "@autocratico/core"
import { z } from "zod"

const MAX_SIGNALS = 12
const cap = (n: number) => z.string().catch("").transform((s) => s.trim().slice(0, n))

/** One entry of the agent's `phishing` list: the id alone (older prompts), or the id with its reasons. */
export const PhishingReport = z.union([
  z.string().transform((id) => ({ id, risk: null, verdict: "", advice: "", signals: [] })),
  z.object({
    id: z.string(),
    risk: PhishingRisk.nullable().catch(null).default(null),
    verdict: cap(400).default(""),
    advice: cap(300).default(""),
    signals: z
      .array(
        z.object({
          kind: z.enum(PHISHING_KINDS).catch("other"),
          severity: PhishingRisk.catch("medium"),
          evidence: cap(300).default(""),
          why: cap(300).default(""),
        })
      )
      .catch([])
      .default([])
      .transform((s) => s.slice(0, MAX_SIGNALS)),
  }),
])
export type PhishingReport = z.output<typeof PhishingReport>

/** The agent's entries that parse; malformed ones are dropped. */
export function parseReports(raw: unknown): PhishingReport[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((r) => {
    const p = PhishingReport.safeParse(r)
    return p.success ? [p.data] : []
  })
}

type Checks = { risk: string; checks: EmailChecks; signals: PhishingSignal[] }

/** checks.json of the email an inbox item points to, when `ref` is a folder of archive/email/; else null. */
export function readChecks(data: string, ref: string): Checks | null {
  if (!/^archive\/email\/[^/.][^/]*$/.test(ref)) return null
  try {
    const root = realpathSync(join(data, "archive", "email"))
    const file = realpathSync(join(data, ref, "checks.json"))
    if (!file.startsWith(root + sep)) return null
    const raw = JSON.parse(readFileSync(file, "utf8")) as { risk?: unknown; signals?: unknown }
    const signals = z
      .array(z.object({ kind: z.enum(PHISHING_KINDS).catch("other"), code: z.string().catch(""), severity: PhishingRisk.catch("low"), evidence: z.string().catch("") }))
      .catch([])
      .parse(raw.signals ?? [])
    return {
      risk: typeof raw.risk === "string" ? raw.risk : "none",
      checks: EmailChecks.parse(raw),
      signals: signals.map((s) => ({ ...s, why: "", source: "check" as const })),
    }
  } catch {
    return null
  }
}

/** The analysis stored in the item: the agent's verdict and reasons, then what the checks found. */
export function analysis(report: PhishingReport, checks: Checks | null, now: Date = new Date()): PhishingAnalysis {
  const fromChecks = checks && PhishingRisk.safeParse(checks.risk).success ? (checks.risk as PhishingAnalysis["risk"]) : null
  return {
    risk: report.risk ?? fromChecks ?? "medium",
    verdict: report.verdict,
    advice: report.advice,
    signals: [...report.signals.map((s) => ({ ...s, code: "", source: "agent" as const })), ...(checks?.signals ?? [])],
    checks: checks?.checks ?? null,
    analyzed: now.toISOString(),
    dismissed: "",
  }
}
