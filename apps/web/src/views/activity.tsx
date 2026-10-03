import * as React from "react"
import { ClockIcon, GitCommitHorizontalIcon, InboxIcon, MessageSquareTextIcon, TerminalIcon, Undo2Icon } from "lucide-react"
import { cn } from "cn"

import { TOOL_ICONS } from "@/components/chat"
import { Sensitive, usePrivacy } from "@/components/privacy"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useI18n } from "@/i18n"
import {
  type Activity as ActivityData,
  activity,
  type Commit,
  commitPatch,
  type JobRun,
  type JobStep,
  type LiveJobs,
  revertCommit,
} from "@/lib/api"

function when(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale === "it" ? "it-IT" : "en-GB", { dateStyle: "short", timeStyle: "short" })
}

/** 45 s, 3:07, 1:02:05 */
function duration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000))
  if (total < 60) return `${total} s`
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, "0")
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`
}

/** The current time, ticking every second while `active`. */
function useNow(active: boolean) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return now
}

/** Agent text: `||...||` marks personal data. */
function AgentText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\|\|(.+?)\|\|/).map((part, i) => (i % 2 ? <Sensitive key={i}>{part}</Sensitive> : part))}
    </>
  )
}

function Steps({ steps, live = false }: { steps: JobStep[]; live?: boolean }) {
  const { t } = useI18n()
  const list = React.useRef<HTMLOListElement>(null)
  // While running, follow the newest step unless the user scrolled up to read.
  React.useEffect(() => {
    const el = list.current
    if (live && el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight
  }, [live, steps.length])
  return (
    <ol ref={list} className="flex max-h-80 flex-col gap-2 overflow-y-auto text-xs">
      {steps.map((s, i) => {
        const Icon = s.tool ? (TOOL_ICONS[s.tool] ?? TerminalIcon) : MessageSquareTextIcon
        return (
          <li key={i} className="flex min-w-0 items-start gap-2">
            <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            {s.tool ? (
              <span className="flex min-w-0 gap-2 text-muted-foreground">
                <span className="shrink-0">{t.chat.tools[s.tool] ?? s.tool}</span>
                <Sensitive className="min-w-0 truncate font-mono text-[0.7rem]">{s.text}</Sensitive>
              </span>
            ) : (
              <span className="min-w-0 leading-relaxed break-words whitespace-pre-line">
                <AgentText text={s.text} />
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function Items({ items }: { items: NonNullable<JobRun["items"]> }) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {items.map((i) => (
        <li key={i.id} className="flex min-w-0 items-center gap-2">
          <InboxIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <Sensitive className="truncate">{i.title}</Sensitive>
        </li>
      ))}
    </ul>
  )
}

/** What is running now, what is queued, when new items get processed. */
export function Now({ live }: { live: LiveJobs | null }) {
  const { t } = useI18n()
  const current = live?.current ?? null
  const now = useNow(Boolean(current || live?.triage))
  const jobName = (j: string) => t.activity.jobs[j] ?? j

  return (
    <Card className="rounded-xl @4xl:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-medium tracking-tight">
          {t.activity.now}
          {current && <span className="size-2 animate-pulse rounded-full bg-status-soon" />}
        </CardTitle>
        <CardDescription>{t.activity.nowDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!live && <Skeleton className="h-16 rounded-lg" />}
        {current && (
          <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-sm">
              <Spinner className="text-muted-foreground" />
              <span className="font-medium">{jobName(current.job)}</span>
              <span className="text-xs text-muted-foreground">
                {t.activity.runningFor(duration(now - new Date(current.started).getTime()))}
              </span>
            </div>
            {current.items && current.items.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">{t.activity.workingOn}</span>
                <Items items={current.items} />
              </div>
            )}
            {current.steps &&
              (current.steps.length ? (
                <Steps steps={current.steps} live />
              ) : (
                <span className="text-xs text-muted-foreground">{t.activity.starting}</span>
              ))}
          </div>
        )}
        {live?.triage && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ClockIcon className="size-4 shrink-0" />
            {new Date(live.triage.at).getTime() > now
              ? t.activity.triageIn(live.triage.items, duration(new Date(live.triage.at).getTime() - now))
              : t.activity.triageSoon(live.triage.items)}
          </p>
        )}
        {live && live.waiting.length > 0 && (
          <p className="text-sm text-muted-foreground">{t.activity.next(live.waiting.map(jobName).join(", "))}</p>
        )}
        {live && !current && !live.triage && !live.waiting.length && (
          <p className="text-sm text-muted-foreground">{t.activity.idle}</p>
        )}
      </CardContent>
    </Card>
  )
}

function RunRow({ r }: { r: JobRun }) {
  const { t, locale } = useI18n()
  const [open, setOpen] = React.useState(false)
  const steps = r.steps ?? []
  const items = r.items ?? []
  return (
    <li className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 text-sm">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-1.5 size-2 shrink-0 rounded-full",
            r.ok === null ? "bg-status-soon" : r.ok ? "bg-status-done" : "bg-status-overdue"
          )}
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium">
            {t.activity.jobs[r.job] ?? r.job}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {when(r.started, locale)}
              {r.finished && ` · ${duration(new Date(r.finished).getTime() - new Date(r.started).getTime())}`} ·{" "}
              {r.ok === null ? t.activity.running : r.ok ? t.activity.ok : t.activity.failed}
            </span>
          </span>
          <span className="text-xs break-words text-muted-foreground">{r.summary}</span>
        </div>
      </div>
      {(steps.length > 0 || items.length > 0) && (
        <div className="flex flex-col gap-3 pl-5">
          <Button variant="ghost" size="xs" className="self-start" onClick={() => setOpen((o) => !o)}>
            {open ? t.activity.hideSteps : t.activity.steps(steps.length)}
          </Button>
          {open && (
            <>
              {items.length > 0 && <Items items={items} />}
              <Steps steps={steps} />
            </>
          )}
        </div>
      )}
    </li>
  )
}

function CommitRow({ c, onReverted }: { c: Commit; onReverted: (msg: string) => void }) {
  const { t, locale } = useI18n()
  const { enabled: privacy } = usePrivacy()
  const [patch, setPatch] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)

  async function toggle() {
    if (!patch) setPatch((await commitPatch(c.hash)).patch)
    setOpen((o) => !o)
  }

  async function revert() {
    if (!window.confirm(t.activity.confirmRevert)) return
    const { hash } = await revertCommit(c.hash)
    onReverted(t.activity.reverted(hash))
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3">
      <div className="flex items-start gap-3">
        <GitCommitHorizontalIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium">{c.subject}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {c.hash} · {when(c.date, locale)} · {c.files.join(", ")}
          </span>
        </div>
      </div>
      <div className="flex gap-2 pl-7">
        <Button variant="ghost" size="xs" onClick={toggle}>
          {open ? t.activity.hidePatch : t.activity.showPatch}
        </Button>
        <Button variant="ghost" size="xs" onClick={revert}>
          <Undo2Icon data-icon="inline-start" />
          {t.activity.revert}
        </Button>
      </div>
      {open && patch && (
        <pre className="ml-7 max-h-96 overflow-auto rounded-md bg-card p-3 font-mono text-xs leading-relaxed">
          {privacy
            ? t.privacy.hidden
            : patch.split("\n").map((line, i) => (
                <span
                  key={i}
                  className={cn(
                    "block",
                    line.startsWith("+") && !line.startsWith("+++") && "text-status-done",
                    line.startsWith("-") && !line.startsWith("---") && "text-status-overdue"
                  )}
                >
                  {line || " "}
                </span>
              ))}
        </pre>
      )}
    </li>
  )
}

export function Activity({ live }: { live: LiveJobs | null }) {
  const { t } = useI18n()
  const [data, setData] = React.useState<ActivityData | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(() => {
    activity().then(setData, (e: Error) => setError(e.message))
  }, [])
  React.useEffect(refresh, [refresh])
  // A run started or finished: the list and the changes are out of date.
  const current = live?.current?.id
  const first = React.useRef(true)
  React.useEffect(() => {
    if (first.current) first.current = false
    else refresh()
  }, [current, refresh])

  return (
    <div className="grid items-start gap-6 @4xl:grid-cols-2">
      <Now live={live} />

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-lg font-medium tracking-tight">{t.activity.runs}</CardTitle>
          <CardDescription>{t.activity.runsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-status-overdue">{error}</p>}
          {!data && !error && <Skeleton className="h-40 rounded-lg" />}
          {data?.runs.length === 0 && <p className="text-sm text-muted-foreground">{t.activity.noRuns}</p>}
          <ul className="flex flex-col gap-2">
            {data?.runs.map((r) => (
              <RunRow key={r.id} r={r} />
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-lg font-medium tracking-tight">{t.activity.changes}</CardTitle>
          <CardDescription>{t.activity.changesDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {message && <p className="text-sm text-status-done">{message}</p>}
          {data?.commits.length === 0 && <p className="text-sm text-muted-foreground">{t.activity.noChanges}</p>}
          <ul className="flex flex-col gap-2">
            {data?.commits.map((c) => (
              <CommitRow
                key={c.hash}
                c={c}
                onReverted={(m) => {
                  setMessage(m)
                  refresh()
                }}
              />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
