import * as React from "react"
import { CALENDAR_NAME, CALENDAR_REDIRECT_PATH } from "@autocratico/core"
import { CalendarDaysIcon, CheckIcon, CopyIcon, ExternalLinkIcon, LogInIcon, PlusIcon, RefreshCwIcon, StarIcon, Trash2Icon } from "lucide-react"

import { Sensitive } from "@/components/privacy"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useI18n } from "@/i18n"
import {
  authorizeCalendar,
  type CalendarAccount,
  type CalendarSetup,
  calendarSetup,
  completeCalendar,
  removeCalendarAccount,
  saveCalendarAccount,
  syncCalendar,
} from "@/lib/api"
import { finishCalendarReturn, hasCalendarReturn } from "@/lib/calendar"
import { useLiveRefresh } from "@/lib/events"

const REDIRECT = `${window.location.origin}${CALENDAR_REDIRECT_PATH}`

/** Lowercase, no accents, only the characters calendar.toml accepts in a name. */
function slug(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[-_]+/, "")
    .slice(0, 32)
}

function CopyField({ value }: { value: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = React.useState(false)
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
      <code className="min-w-0 flex-1 font-mono text-sm break-all">{value}</code>
      <Button type="button" variant="secondary" size="sm" onClick={() => void navigator.clipboard.writeText(value).then(() => setCopied(true))}>
        <CopyIcon data-icon="inline-start" />
        {copied ? t.settings.copied : t.settings.copy}
      </Button>
    </div>
  )
}

/** Signs an account in: a web client leaves for Google and comes back; a desktop one needs the address pasted. */
function useSignIn(onDone: (r: { name: string; address: string }) => void) {
  const [pending, setPending] = React.useState<string | null>(null)
  const [pasted, setPasted] = React.useState("")
  const start = async (name: string) => {
    const { url, type } = await authorizeCalendar(name)
    if (type === "web") return window.location.assign(url)
    window.open(url, "_blank", "noopener,noreferrer")
    setPending(name)
  }
  const finish = async () => {
    const r = await completeCalendar(pasted.trim())
    setPending(null)
    setPasted("")
    onDone(r)
  }
  return { pending, pasted, setPasted, start, finish }
}

function Calendars({ a, onChanged }: { a: CalendarAccount; onChanged: () => void }) {
  const { t } = useI18n()
  const [busy, setBusy] = React.useState(false)
  const save = async (calendars: string[], def?: string) => {
    setBusy(true)
    try {
      await saveCalendarAccount({ name: a.name, calendars, ...(def ? { default: def } : {}) })
      onChanged()
    } finally {
      setBusy(false)
    }
  }
  const synced = a.calendars.filter((c) => c.synced).map((c) => c.id)
  return (
    <ul className="flex flex-col gap-1.5 pl-7">
      {a.calendars.map((c) => {
        const writable = c.role === "owner" || c.role === "writer"
        return (
          <li key={c.id} className="flex min-w-0 items-center gap-2 text-xs">
            <Checkbox
              checked={c.synced}
              disabled={busy || (c.synced && synced.length === 1)}
              onCheckedChange={(v) => void save(v === true ? [...synced, c.id] : synced.filter((id) => id !== c.id))}
              aria-label={t.calendar.copy(c.title)}
            />
            <span className="size-2.5 shrink-0 rounded-full bg-muted-foreground" style={c.color ? { backgroundColor: c.color } : undefined} />
            <span className="min-w-0 flex-1 truncate">
              <Sensitive>{c.title}</Sensitive>
              {!writable && <span className="text-muted-foreground"> · {t.calendar.readOnly}</span>}
            </span>
            {c.default ? (
              <Badge variant="secondary" className="shrink-0">
                <StarIcon />
                {t.calendar.default}
              </Badge>
            ) : (
              writable &&
              c.synced && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={busy} onClick={() => void save(synced, c.id)}>
                  {t.calendar.makeDefault}
                </Button>
              )
            )}
          </li>
        )
      })}
    </ul>
  )
}

function AccountRow({ a, onConnect, onChanged }: { a: CalendarAccount; onConnect: () => void; onChanged: () => void }) {
  const { t, fmt } = useI18n()
  return (
    <li className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <CalendarDaysIcon className="size-4 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{a.name}</span>
            <Badge className="shrink-0" variant={a.state === "connected" ? "secondary" : "outline"}>
              {t.calendar.states[a.state]}
            </Badge>
          </span>
          {a.address && (
            <span className="truncate text-xs text-muted-foreground">
              <Sensitive>{a.address}</Sensitive>
            </span>
          )}
          {a.state === "connected" && (
            <span className="text-xs text-muted-foreground">
              {a.synced_at ? t.calendar.synced(fmt.dayMonthTime.format(new Date(a.synced_at)), a.events) : t.calendar.neverSynced}
            </span>
          )}
          {a.error && <span className="text-xs text-status-overdue">{a.error}</span>}
        </div>
        <div className="flex gap-1">
          {a.state !== "connected" && (
            <Button variant="secondary" size="sm" onClick={onConnect}>
              <LogInIcon data-icon="inline-start" />
              {a.state === "reconnect" ? t.calendar.reconnect : t.calendar.connect}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t.calendar.remove}
            onClick={async () => {
              if (!window.confirm(t.calendar.confirmRemove(a.name))) return
              await removeCalendarAccount(a.name)
              onChanged()
            }}
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>
      {a.calendars.length > 0 && <Calendars a={a} onChanged={onChanged} />}
    </li>
  )
}

/** Google Calendar accounts in Settings: the OAuth client is Gmail's, each account signs in on its own. */
export function GoogleCalendarCard() {
  const { t } = useI18n()
  const [setup, setSetup] = React.useState<CalendarSetup | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<{ name: string; address: string } | null>(null)
  const [name, setName] = React.useState("")
  const [adding, setAdding] = React.useState(false)
  // Back from Google: busy until the sign-in is finished below.
  const [busy, setBusy] = React.useState(hasCalendarReturn)
  const [syncing, setSyncing] = React.useState(false)
  const refresh = React.useCallback(() => {
    calendarSetup().then(setSetup, (e: Error) => setError(e.message))
  }, [])
  React.useEffect(refresh, [refresh])
  useLiveRefresh("calendar", refresh, 120_000)
  const signIn = useSignIn((r) => {
    setDone(r)
    refresh()
  })

  // Back from Google with a web client: finish the sign-in the browser was sent away for.
  React.useEffect(() => {
    if (!hasCalendarReturn()) return
    const finishing = finishCalendarReturn() ?? Promise.reject(new Error(t.calendar.expired))
    finishing
      .then((r) => {
        setDone(r)
        refresh()
      }, (e: Error) => setError(e.message))
      .finally(() => setBusy(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function attempt(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const exists = setup?.accounts.some((a) => a.name === name)
  const missingRedirect = setup?.client?.type === "web" && !setup.client.redirects.includes(REDIRECT)

  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="text-lg font-medium tracking-tight">{t.calendar.title}</CardTitle>
        <CardDescription>{t.calendar.description}</CardDescription>
      </CardHeader>
      <CardContent className="@container flex flex-col gap-4">
        {!setup && !error && <Skeleton className="h-24 rounded-lg" />}
        {setup && !setup.client && <p className="text-sm text-muted-foreground">{t.calendar.noClient}</p>}
        {setup?.client && (
          <>
            {setup.accounts.length === 0 && !adding && <p className="text-sm text-muted-foreground">{t.calendar.none}</p>}
            {setup.accounts.length > 0 && (
              <ul className="flex flex-col gap-2">
                {setup.accounts.map((a) => (
                  <AccountRow key={a.name} a={a} onChanged={refresh} onConnect={() => void attempt(() => signIn.start(a.name))} />
                ))}
              </ul>
            )}
            {done && (
              <p className="flex items-center gap-2 text-sm text-status-done">
                <CheckIcon className="size-4" />
                {t.calendar.connected(done.name)}
                {done.address && (
                  <span className="text-muted-foreground">
                    <Sensitive>{done.address}</Sensitive>
                  </span>
                )}
              </p>
            )}
            {busy && hasCalendarReturn() && <p className="text-sm text-muted-foreground">{t.calendar.finishing}</p>}
            {signIn.pending && (
              <form
                className="flex flex-col gap-3 rounded-lg border p-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  void attempt(signIn.finish)
                }}
              >
                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-muted-foreground">{t.calendar.pasteLabel}</span>
                  <Input
                    value={signIn.pasted}
                    onChange={(e) => signIn.setPasted(e.target.value)}
                    placeholder="http://127.0.0.1:…/?state=…&code=…"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </label>
                <Button type="submit" className="self-start" disabled={busy || !signIn.pasted.trim()}>
                  {t.calendar.finish}
                </Button>
              </form>
            )}
            {adding && (
              <form
                className="flex flex-col gap-4 rounded-lg border p-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  void attempt(async () => {
                    await saveCalendarAccount({ name })
                    refresh()
                    await signIn.start(name)
                  })
                }}
              >
                <ol className="flex flex-col gap-2 text-sm">
                  <li className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-card font-mono text-xs">1</span>
                    <span className="min-w-0 flex-1 leading-relaxed">{t.calendar.enableApi}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      render={<a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noopener noreferrer" />}
                      nativeButton={false}
                    >
                      <ExternalLinkIcon data-icon="inline-start" />
                      {t.calendar.open}
                    </Button>
                  </li>
                  {setup.client.type === "web" && (
                    <li className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3">
                      <span className="flex items-start gap-3">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-card font-mono text-xs">2</span>
                        <span className="min-w-0 flex-1 leading-relaxed">{t.calendar.redirect}</span>
                      </span>
                      <CopyField value={REDIRECT} />
                    </li>
                  )}
                </ol>
                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-muted-foreground">{t.calendar.name}</span>
                  <Input value={name} onChange={(e) => setName(slug(e.target.value))} placeholder={t.calendar.namePlaceholder} maxLength={32} autoComplete="off" autoFocus />
                  <span className="text-xs text-muted-foreground">{exists ? t.calendar.nameTaken : t.calendar.nameHint}</span>
                </label>
                <div className="flex justify-between gap-2">
                  <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                    {t.calendar.cancel}
                  </Button>
                  <Button type="submit" disabled={busy || !CALENDAR_NAME.test(name) || exists}>
                    <LogInIcon data-icon="inline-start" />
                    {t.calendar.signIn}
                  </Button>
                </div>
              </form>
            )}
            {missingRedirect && setup.accounts.length > 0 && <p className="text-xs text-status-soon">{t.calendar.redirectMissing(REDIRECT)}</p>}
            {!adding && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <Button variant="secondary" onClick={() => setAdding(true)}>
                  <PlusIcon data-icon="inline-start" />
                  {t.calendar.add}
                </Button>
                {setup.accounts.some((a) => a.state === "connected") && (
                  <Button
                    variant="ghost"
                    disabled={syncing}
                    onClick={() => {
                      setSyncing(true)
                      void syncCalendar()
                        .then(refresh, (e: Error) => setError(e.message))
                        .finally(() => setSyncing(false))
                    }}
                  >
                    <RefreshCwIcon data-icon="inline-start" className={syncing ? "animate-spin" : undefined} />
                    {t.calendar.syncNow}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
        {error && <p className="text-sm text-status-overdue">{error}</p>}
      </CardContent>
    </Card>
  )
}
