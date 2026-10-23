import * as React from "react"
import type { PhishingKind, PhishingSignal } from "@autocratico/core"
import {
  AlarmClockIcon,
  ArrowRightIcon,
  BookOpenIcon,
  CircleHelpIcon,
  CreditCardIcon,
  EuroIcon,
  Link2Icon,
  LockKeyholeIcon,
  PaperclipIcon,
  ReplyIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react"
import { cn } from "cn"

import { Sensitive } from "@/components/privacy"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n"
import { type PhishingAnalysis, setPhishingDismissed } from "@/lib/api"
import { STYLE } from "@/lib/status"

const KIND_ICON: Record<PhishingKind, LucideIcon> = {
  auth: LockKeyholeIcon,
  sender: UserRoundIcon,
  reply_to: ReplyIcon,
  link: Link2Icon,
  urgency: AlarmClockIcon,
  payment: EuroIcon,
  credentials: CreditCardIcon,
  attachment: PaperclipIcon,
  context: BookOpenIcon,
  other: CircleHelpIcon,
}

/** Risk onto the status colors: high reads as overdue, medium as urgent, low as soon. */
const RISK_STYLE: Record<PhishingAnalysis["risk"], { soft: string; dot: string }> = {
  high: STYLE.overdue,
  medium: STYLE.urgent,
  low: STYLE.soon,
}
const RANK = { high: 0, medium: 1, low: 2 }
const LINKS_SHOWN = 8

/** Text with `||personal data||` hidden in privacy mode; never a link. */
function Plain({ text }: { text: string }) {
  return text.split(/\|\|(.+?)\|\|/).map((part, i) => (i % 2 ? <Sensitive key={i}>{part}</Sensitive> : <React.Fragment key={i}>{part}</React.Fragment>))
}

/** The badge of a flagged email, for lists (Inbox, Archive). */
export function PhishingBadge({ risk, dismissed, className }: { risk: PhishingAnalysis["risk"]; dismissed: boolean; className?: string }) {
  const { t } = useI18n()
  return (
    <Badge variant="secondary" className={cn("shrink-0", dismissed ? "bg-muted text-muted-foreground" : RISK_STYLE[risk].soft, className)}>
      {dismissed ? <ShieldCheckIcon data-icon="inline-start" /> : <ShieldAlertIcon data-icon="inline-start" />}
      {dismissed ? t.phishing.dismissedBadge : t.phishing.badge}
    </Badge>
  )
}

/**
 * The parts of an email's text that the analysis quotes, as one case-insensitive pattern (spaces and
 * line breaks may differ); null when nothing is quoted. Dismissed analyses mark nothing.
 */
export function suspiciousPattern(analysis: PhishingAnalysis | null): RegExp | null {
  if (!analysis || analysis.dismissed) return null
  const links = (analysis.checks?.links ?? []).filter((l) => l.flags.length).map((l) => l.text)
  const quotes = [...new Set([...analysis.signals.map((s) => s.evidence), ...links].map((q) => q.trim()).filter((q) => q.length >= 4 && q.length <= 300))]
  if (!quotes.length) return null
  const escaped = quotes.sort((a, b) => b.length - a.length).map((q) => q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"))
  return new RegExp(`(${escaped.join("|")})`, "gi")
}

/** `text` with the suspicious parts marked. */
export function Marked({ text, pattern }: { text: string; pattern: RegExp | null }) {
  if (!pattern) return text
  return text.split(pattern).map((part, i) =>
    i % 2 ? (
      <mark key={i} className="rounded-sm bg-status-overdue/15 px-0.5 text-foreground ring-1 ring-status-overdue/30">
        {part}
      </mark>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  )
}

function Signal({ s }: { s: PhishingSignal }) {
  const { t } = useI18n()
  const Icon = KIND_ICON[s.kind] ?? CircleHelpIcon
  const explanation = s.why || t.phishing.codes[s.code] || ""
  return (
    <li className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-card">
        <Icon className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className={cn("size-1.5 rounded-full", RISK_STYLE[s.severity].dot)} aria-hidden />
          <span className="font-medium text-foreground">{t.phishing.kinds[s.kind] ?? s.kind}</span>
          <span>· {s.source === "agent" ? t.phishing.agent : t.phishing.check}</span>
        </span>
        {explanation && (
          <span className="text-sm leading-snug">
            <Plain text={explanation} />
          </span>
        )}
        {s.evidence && (
          <q className="w-fit max-w-full rounded-md bg-card px-2 py-1 font-mono text-xs wrap-anywhere text-muted-foreground">
            <Sensitive>{s.evidence}</Sensitive>
          </q>
        )}
      </div>
    </li>
  )
}

function Auth({ name, value }: { name: string; value: string }) {
  const { t } = useI18n()
  const tone = value === "pass" ? STYLE.done.soft : ["fail", "softfail", "permerror"].includes(value) ? STYLE.overdue.soft : "bg-muted text-muted-foreground"
  return (
    <Badge variant="secondary" className={tone}>
      {name} {value ? (t.phishing.auth[value] ?? value) : t.phishing.unknown}
    </Badge>
  )
}

function Technical({ checks }: { checks: NonNullable<PhishingAnalysis["checks"]> }) {
  const { t } = useI18n()
  const [all, setAll] = React.useState(false)
  const links = all ? checks.links : checks.links.slice(0, LINKS_SHOWN)
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex flex-wrap gap-x-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 font-mono wrap-anywhere">{value}</span>
    </div>
  )
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-xs font-medium text-muted-foreground">{t.phishing.technical}</h4>
      {checks.partial ? (
        <p className="text-xs text-muted-foreground">{t.phishing.partial}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <Auth name="SPF" value={checks.auth.spf} />
          <Auth name="DKIM" value={checks.auth.dkim} />
          <Auth name="DMARC" value={checks.auth.dmarc} />
        </div>
      )}
      {checks.from.address &&
        row(
          t.phishing.sender,
          <Sensitive>
            {checks.from.name ? `${checks.from.name} <${checks.from.address}>` : checks.from.address}
          </Sensitive>
        )}
      {checks.reply_to && row(t.phishing.replyTo, checks.reply_to)}
      {checks.return_path && checks.return_path !== checks.from.domain && row(t.phishing.returnPath, checks.return_path)}
      {checks.links.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">
            {t.phishing.links} · {t.phishing.linksNote}
          </span>
          <ul className="flex flex-col gap-1.5">
            {links.map((l, i) => (
              <li key={i} className={cn("flex flex-col gap-1 rounded-md bg-card p-2 text-xs", l.flags.length > 0 && "ring-1 ring-status-overdue/25")}>
                <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
                  {l.text && (
                    <>
                      <span className="wrap-anywhere">
                        <Sensitive>{l.text}</Sensitive>
                      </span>
                      <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground" aria-label={t.phishing.goesTo} />
                    </>
                  )}
                  <span className="font-mono font-medium wrap-anywhere">{l.domain}</span>
                </span>
                <span className="font-mono text-[0.7rem] wrap-anywhere text-muted-foreground" title={t.phishing.linksNote}>
                  <Sensitive>{l.href}</Sensitive>
                </span>
                {l.flags.length > 0 && (
                  <span className="flex flex-wrap gap-1">
                    {l.flags.map((f) => (
                      <Badge key={f} variant="secondary" className={STYLE.overdue.soft}>
                        {t.phishing.flags[f] ?? f}
                      </Badge>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {checks.links.length > LINKS_SHOWN && !all && (
            <Button variant="ghost" size="xs" className="w-fit" onClick={() => setAll(true)}>
              {t.phishing.more(checks.links.length - LINKS_SHOWN)}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * Why an email was flagged: the agent's verdict and advice, each reason with the exact part of the
 * email it is about, and the technical checks (authentication, real sender, where links go).
 * Links are shown as text only. With `item`, the user can say it is not phishing (or take it back).
 */
export function PhishingReport({ analysis, item, onChange, className }: { analysis: PhishingAnalysis; item?: string | null; onChange?: () => void; className?: string }) {
  const { t, fmt } = useI18n()
  const [busy, setBusy] = React.useState(false)
  const dismissed = Boolean(analysis.dismissed)
  const signals = [...analysis.signals].sort((a, b) => (a.source === b.source ? RANK[a.severity] - RANK[b.severity] : a.source === "agent" ? -1 : 1))

  async function toggle() {
    if (!item) return
    setBusy(true)
    try {
      await setPhishingDismissed(item, !dismissed)
      onChange?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-4 rounded-lg p-3 ring-1", dismissed ? "bg-muted/50 ring-border" : "bg-status-overdue/5 ring-status-overdue/25", className)}>
      <div className="flex items-start gap-3">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", dismissed ? "bg-card" : RISK_STYLE[analysis.risk].soft)}>
          {dismissed ? <ShieldCheckIcon className="size-4" /> : <ShieldAlertIcon className="size-4" />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{t.phishing.title}</span>
            <Badge variant="secondary" className={dismissed ? "bg-muted text-muted-foreground" : RISK_STYLE[analysis.risk].soft}>
              {t.phishing.risk[analysis.risk]}
            </Badge>
          </span>
          {analysis.verdict && (
            <p className="text-sm leading-relaxed">
              <Plain text={analysis.verdict} />
            </p>
          )}
          {analysis.advice && !dismissed && (
            <p className="text-sm font-medium leading-relaxed">
              <Plain text={analysis.advice} />
            </p>
          )}
          {dismissed && <p className="text-xs text-muted-foreground">{t.phishing.dismissed(fmt.short.format(new Date(analysis.dismissed)))}</p>}
        </div>
        {item && (
          <Button variant="secondary" size="xs" className="shrink-0" disabled={busy} onClick={toggle}>
            {dismissed ? t.phishing.restore : t.phishing.dismiss}
          </Button>
        )}
      </div>
      {signals.length > 0 && (
        <section className="flex flex-col gap-2">
          <h4 className="text-xs font-medium text-muted-foreground">{t.phishing.why}</h4>
          <ul className="flex flex-col gap-3">
            {signals.map((s, i) => (
              <Signal key={i} s={s} />
            ))}
          </ul>
        </section>
      )}
      {analysis.checks && <Technical checks={analysis.checks} />}
    </div>
  )
}
