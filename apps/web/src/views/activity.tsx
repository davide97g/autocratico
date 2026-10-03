import * as React from "react"
import { GitCommitHorizontalIcon, Undo2Icon } from "lucide-react"
import { cn } from "cn"

import { usePrivacy } from "@/components/privacy"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useI18n } from "@/i18n"
import { type Activity as ActivityData, activity, type Commit, commitPatch, revertCommit } from "@/lib/api"

function when(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale === "it" ? "it-IT" : "en-GB", { dateStyle: "short", timeStyle: "short" })
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

export function Activity() {
  const { t, locale } = useI18n()
  const [data, setData] = React.useState<ActivityData | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(() => {
    activity().then(setData, (e: Error) => setError(e.message))
  }, [])
  React.useEffect(refresh, [refresh])

  return (
    <div className="grid items-start gap-6 @4xl:grid-cols-2">
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
              <li key={r.id} className="flex items-start gap-3 rounded-lg bg-muted/50 p-3 text-sm">
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
                      {when(r.started, locale)} · {r.ok === null ? t.activity.running : r.ok ? t.activity.ok : t.activity.failed}
                    </span>
                  </span>
                  <span className="text-xs break-words text-muted-foreground">{r.summary}</span>
                </div>
              </li>
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
