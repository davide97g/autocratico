import * as React from "react"
import {
  AlarmClockIcon,
  CompassIcon,
  CopyIcon,
  KeyboardIcon,
  KeyRoundIcon,
  LaptopIcon,
  LogOutIcon,
  MonitorIcon,
  PlayIcon,
  SendIcon,
  SmartphoneIcon,
  TabletIcon,
} from "lucide-react"
import { cn } from "cn"

import { FinanceCard } from "@/components/finance"
import { GmailCard } from "@/components/gmail"
import { UsageCard } from "@/components/usage"
import { Sensitive } from "@/components/privacy"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Kbd, MOD } from "@/components/kbd"
import { PalettePicker, ThemeSwitch } from "@/components/palette-picker"
import { CardSkeleton, RowsSkeleton } from "@/components/skeletons"
import { Switch } from "@/components/ui/switch"
import { useI18n } from "@/i18n"
import { LanguageSwitch } from "@/components/shell"
import { useConnection, useLiveRefresh } from "@/lib/events"
import { jobIcon } from "@/lib/format"
import { usePrefs } from "@/lib/prefs"
import { UsernameHint } from "@/views/login"
import {
  type AccountSession,
  ApiError,
  cancelReminder,
  changePassword,
  createDevice,
  type Device,
  devices as loadDevices,
  logout,
  type Reminder,
  reminders as loadReminders,
  rename,
  revokeDevice,
  revokeSession,
  runJob,
  type Session,
  sessions as loadSessions,
  type Status,
  status as loadStatus,
  type TelegramChat,
  telegramChats,
  telegramPair,
  telegramUnpair,
} from "@/lib/api"

function when(iso: string | null, locale: string, never: string) {
  return iso ? new Date(iso).toLocaleString(locale === "it" ? "it-IT" : "en-GB", { dateStyle: "short", timeStyle: "short" }) : never
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}

function Secret({ label, value }: { label: string; value: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = React.useState(false)
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 font-mono text-sm break-all">{value}</code>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => setCopied(true))
          }}
        >
          <CopyIcon data-icon="inline-start" />
          {copied ? t.settings.copied : t.settings.copy}
        </Button>
      </div>
    </div>
  )
}

function ServerCard({ s, onRefresh }: { s: Status; onRefresh: () => void }) {
  const { t, locale } = useI18n()
  const [running, setRunning] = React.useState<string | null>(null)
  async function run(job: string) {
    setRunning(job)
    try {
      await runJob(job)
    } finally {
      setRunning(null)
      onRefresh()
    }
  }
  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="text-lg font-medium tracking-tight">{t.settings.server}</CardTitle>
        <CardDescription>{t.settings.serverDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div>
          <Row label={t.settings.version}>{s.version}</Row>
          <Row label={t.settings.mode}>{t.settings.modes[s.auth]}</Row>
          <Row label={t.settings.claude}>{s.claude ? t.settings.available : t.settings.missing}</Row>
          <Row label={t.settings.speech}>{s.speech ? t.settings.available : t.settings.missing}</Row>
          <Row label={t.views.inbox}>{t.settings.inboxCounts(s.inbox.new, s.inbox.failed)}</Row>
        </div>
        <ul className="flex flex-col gap-2">
          {s.jobs.map((j) => (
            <li key={j.job} className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-card">
                {React.createElement(jobIcon(j.job), { className: "size-4" })}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                <span className="font-medium">{t.activity.jobs[j.job] ?? j.job}</span>
                <span className="text-xs break-words text-muted-foreground">
                  {t.settings.lastRun}: {when(j.last?.started ?? null, locale, t.settings.never)}
                  {j.last && ` · ${j.last.ok ? t.activity.ok : t.activity.failed} · ${j.last.summary}`}
                </span>
                {j.next && (
                  <span className="text-xs text-muted-foreground">
                    {t.settings.nextRun}: {when(j.next, locale, t.settings.never)}
                  </span>
                )}
              </div>
              <Button variant="secondary" size="sm" disabled={running !== null} onClick={() => run(j.job)}>
                <PlayIcon data-icon="inline-start" />
                {running === j.job ? "…" : t.settings.runNow}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

const MIN_PASSWORD = 8

function AccountCard({
  session,
  onRenamed,
  onSignedOut,
  onTour,
}: {
  session: Session
  onRenamed: () => void
  onSignedOut: () => void
  onTour: () => void
}) {
  const { t } = useI18n()
  const [name, setName] = React.useState(session.user?.name ?? "")
  const [renamed, setRenamed] = React.useState(false)
  const [current, setCurrent] = React.useState("")
  const [next, setNext] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [others, setOthers] = React.useState(true)
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function saveName(e: React.FormEvent) {
    e.preventDefault()
    await rename(name.trim())
    setRenamed(true)
    onRenamed()
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    if (next.length < MIN_PASSWORD) return setMessage({ ok: false, text: t.onboarding.tooShort(MIN_PASSWORD) })
    if (next !== confirm) return setMessage({ ok: false, text: t.onboarding.mismatch })
    setBusy(true)
    try {
      await changePassword(current, next, others)
      setCurrent("")
      setNext("")
      setConfirm("")
      setMessage({ ok: true, text: t.settings.passwordChanged })
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0
      const text =
        status === 401 ? t.login.wrong : status === 429 ? t.login.locked(Math.max(1, Math.ceil((err as ApiError).retryAfter / 60))) : (err as Error).message
      setMessage({ ok: false, text })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="text-lg font-medium tracking-tight">{t.settings.account}</CardTitle>
        <CardDescription>{t.settings.accountDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <form onSubmit={saveName} className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-2 text-sm">
            <span className="text-muted-foreground">{t.settings.name}</span>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setRenamed(false)
              }}
              maxLength={60}
              autoComplete="name"
            />
          </label>
          <Button type="submit" variant="secondary" disabled={!name.trim() || name.trim() === session.user?.name}>
            {renamed ? t.settings.saved : t.settings.rename}
          </Button>
        </form>

        <form onSubmit={savePassword} className="flex flex-col gap-3 border-t pt-4">
          <span className="text-sm font-medium">{t.settings.changePassword}</span>
          <UsernameHint />
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-muted-foreground">{t.settings.currentPassword}</span>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-muted-foreground">{t.settings.newPassword}</span>
              <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" maxLength={128} />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-muted-foreground">{t.settings.confirmPassword}</span>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" maxLength={128} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={others} onCheckedChange={(v) => setOthers(v === true)} />
            {t.settings.logoutOthers}
          </label>
          {message && <p className={message.ok ? "text-sm text-status-done" : "text-sm text-status-overdue"}>{message.text}</p>}
          <Button type="submit" variant="secondary" className="self-start" disabled={busy || !current || !next || !confirm}>
            <KeyRoundIcon data-icon="inline-start" />
            {t.settings.changePassword}
          </Button>
        </form>

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button variant="secondary" onClick={onTour}>
            <CompassIcon data-icon="inline-start" />
            {t.settings.restartTour}
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await logout().catch(() => undefined)
              onSignedOut()
            }}
          >
            <LogOutIcon data-icon="inline-start" />
            {t.settings.logout}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

const DEVICE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  iPhone: SmartphoneIcon,
  Android: SmartphoneIcon,
  iPad: TabletIcon,
  Mac: LaptopIcon,
}

function SessionsCard() {
  const { t, locale } = useI18n()
  const [list, setList] = React.useState<AccountSession[]>([])
  const refresh = React.useCallback(() => {
    loadSessions().then(setList, () => undefined)
  }, [])
  React.useEffect(refresh, [refresh])

  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="text-lg font-medium tracking-tight">{t.settings.sessions}</CardTitle>
        <CardDescription>{t.settings.sessionsDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {list.map((d) => {
            const Icon = DEVICE_ICON[d.name] ?? MonitorIcon
            return (
              <li key={d.id} className="flex items-center gap-3 rounded-lg bg-muted/50 p-3 text-sm">
                <Icon className="size-4 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-medium">
                    {d.name}
                    {d.current && <span className="ml-2 text-xs font-normal text-muted-foreground">({t.settings.thisDevice})</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t.settings.since(when(d.created, locale, ""))} · {t.settings.lastSeen(when(d.last_seen, locale, t.settings.never))}
                  </span>
                </div>
                {!d.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      if (!window.confirm(t.settings.confirmRevoke)) return
                      await revokeSession(d.id)
                      refresh()
                    }}
                  >
                    {t.settings.revoke}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

function ShortcutsCard() {
  const { t, locale } = useI18n()
  const [list, setList] = React.useState<Device[]>([])
  const [name, setName] = React.useState("")
  const [token, setToken] = React.useState<string | null>(null)
  const refresh = React.useCallback(() => {
    loadDevices().then(setList, () => undefined)
  }, [])
  React.useEffect(refresh, [refresh])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    const r = await createDevice(name.trim() || "shortcut")
    setToken(r.token)
    setName("")
    refresh()
  }

  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="text-lg font-medium tracking-tight">{t.settings.shortcuts}</CardTitle>
        <CardDescription>{t.settings.shortcutsDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {list.length === 0 && <p className="text-sm text-muted-foreground">{t.settings.noShortcuts}</p>}
        <ul className="flex flex-col gap-2">
          {list.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-lg bg-muted/50 p-3 text-sm">
              <KeyRoundIcon className="size-4 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium">{d.name}</span>
                <span className="text-xs text-muted-foreground">{t.settings.tokenLastSeen(when(d.last_seen, locale, t.settings.never))}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (!window.confirm(t.settings.confirmRevokeToken)) return
                  await revokeDevice(d.id)
                  refresh()
                }}
              >
                {t.settings.revokeToken}
              </Button>
            </li>
          ))}
        </ul>
        <form onSubmit={create} className="flex items-end gap-2 border-t pt-4">
          <label className="flex flex-1 flex-col gap-2 text-sm">
            <span className="text-muted-foreground">{t.settings.tokenName}</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.settings.tokenNamePlaceholder} maxLength={60} />
          </label>
          <Button type="submit" variant="secondary">
            <KeyRoundIcon data-icon="inline-start" />
            {t.settings.newShortcut}
          </Button>
        </form>
        {token && <Secret label={t.settings.tokenIs} value={token} />}
      </CardContent>
    </Card>
  )
}

function TelegramCard({ enabled }: { enabled: boolean }) {
  const { t, locale } = useI18n()
  const [chats, setChats] = React.useState<TelegramChat[]>([])
  const [pairing, setPairing] = React.useState<{ code: string; bot: string | null } | null>(null)
  const refresh = React.useCallback(() => {
    telegramChats().then(setChats, () => undefined)
  }, [])
  React.useEffect(refresh, [refresh])

  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="text-lg font-medium tracking-tight">{t.settings.telegram}</CardTitle>
        <CardDescription>{t.settings.telegramDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!enabled && <p className="text-sm text-muted-foreground">{t.settings.telegramOff}</p>}
        <ul className="flex flex-col gap-2">
          {chats.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-lg bg-muted/50 p-3 text-sm">
              <SendIcon className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                <Sensitive>{c.name}</Sensitive>
                <span className="ml-2 text-xs text-muted-foreground">{when(c.paired, locale, "")}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await telegramUnpair(c.id)
                  refresh()
                }}
              >
                {t.settings.unpair}
              </Button>
            </li>
          ))}
        </ul>
        {enabled && (
          <Button variant="secondary" className="self-start" onClick={async () => setPairing(await telegramPair())}>
            <SendIcon data-icon="inline-start" />
            {t.settings.telegramPair}
          </Button>
        )}
        {pairing && <Secret label={t.settings.telegramSend(pairing.bot, pairing.code)} value={`/start ${pairing.code}`} />}
      </CardContent>
    </Card>
  )
}

/** One preference: what it is on the left, its control on the right. */
function PrefRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

const LIVE_DOT = { live: "bg-status-done", connecting: "bg-status-soon", offline: "bg-muted-foreground" } as const

/** How the app looks and moves on this device: theme, palette, language, animations, notices, sidebar. */
function InterfaceCard({ onShortcuts }: { onShortcuts: () => void }) {
  const { t } = useI18n()
  const { prefs, set } = usePrefs()
  const connection = useConnection()
  const toggle = (key: "reduceMotion" | "splash" | "liveNotices" | "compact", label: string, hint: string) => (
    <PrefRow label={label} hint={hint}>
      <Switch checked={prefs[key]} onCheckedChange={(v) => set(key, v)} aria-label={label} />
    </PrefRow>
  )
  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="text-lg font-medium tracking-tight">{t.settings.interface.title}</CardTitle>
        <CardDescription>{t.settings.interface.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col">
        <PrefRow label={t.settings.interface.theme}>
          <ThemeSwitch />
        </PrefRow>
        <div className="flex flex-col gap-3 border-b py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{t.settings.interface.palette}</span>
            <span className="text-xs text-muted-foreground">{t.settings.interface.paletteHint}</span>
          </div>
          <PalettePicker />
        </div>
        <PrefRow label={t.settings.interface.language} hint={t.settings.languageDescription}>
          <LanguageSwitch compact={false} touch />
        </PrefRow>
        {toggle("reduceMotion", t.settings.interface.reduceMotion, t.settings.interface.reduceMotionHint)}
        {toggle("splash", t.settings.interface.splash, t.settings.interface.splashHint)}
        {toggle("liveNotices", t.settings.interface.liveNotices, t.settings.interface.liveNoticesHint)}
        {toggle("compact", t.settings.interface.compact, t.settings.interface.compactHint)}
        <PrefRow label={t.settings.interface.live}>
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className={cn("size-2 rounded-full transition-colors", LIVE_DOT[connection])} />
            {t.settings.interface.liveStates[connection]}
          </span>
        </PrefRow>
        <PrefRow label={t.settings.interface.shortcuts} hint={t.settings.interface.shortcutsHint}>
          <Button variant="secondary" size="sm" onClick={onShortcuts}>
            <KeyboardIcon data-icon="inline-start" />
            {t.settings.interface.showShortcuts}
            <span className="ml-1 hidden items-center gap-0.5 pointer-fine:flex">
              <Kbd>{MOD}</Kbd>
              <Kbd>K</Kbd>
            </span>
          </Button>
        </PrefRow>
      </CardContent>
    </Card>
  )
}

function RemindersCard() {
  const { t, locale } = useI18n()
  const [list, setList] = React.useState<Reminder[]>([])
  const refresh = React.useCallback(() => {
    loadReminders().then(setList, () => undefined)
  }, [])
  React.useEffect(refresh, [refresh])
  // Set from the chat or Telegram, sent by the server: the list follows.
  useLiveRefresh("reminders", refresh, 60_000)
  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="text-lg font-medium tracking-tight">{t.settings.reminders}</CardTitle>
        <CardDescription>{t.settings.remindersDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {list.length === 0 && <p className="text-sm text-muted-foreground">{t.settings.noReminders}</p>}
        <ul className="flex flex-col gap-2">
          {list.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-lg bg-muted/50 p-3 text-sm">
              <AlarmClockIcon className="size-4 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate">
                  <Sensitive>{r.text}</Sensitive>
                </span>
                <span className="text-xs text-muted-foreground">{when(r.at, locale, "")}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await cancelReminder(r.id)
                  refresh()
                }}
              >
                {t.settings.cancel}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export function Settings({
  session,
  onRenamed,
  onSignedOut,
  onTour,
  onShortcuts,
}: {
  session: Session
  onRenamed: () => void
  onSignedOut: () => void
  onTour: () => void
  onShortcuts: () => void
}) {
  const [s, setS] = React.useState<Status | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const refresh = React.useCallback(() => {
    loadStatus().then(setS, (e: Error) => setError(e.message))
  }, [])
  React.useEffect(refresh, [refresh])

  if (error) return <p className="text-sm text-status-overdue">{error}</p>
  if (!s)
    return (
      <div className="grid items-start gap-4 sm:gap-6 @4xl:grid-cols-2">
        <CardSkeleton>
          <RowsSkeleton rows={3} />
        </CardSkeleton>
        <CardSkeleton>
          <RowsSkeleton rows={4} />
        </CardSkeleton>
      </div>
    )
  return (
    <div className="grid items-start gap-4 sm:gap-6 @4xl:grid-cols-2">
      <div className="flex flex-col gap-4 sm:gap-6">
        <InterfaceCard onShortcuts={onShortcuts} />
        <AccountCard session={session} onRenamed={onRenamed} onSignedOut={onSignedOut} onTour={onTour} />
        <SessionsCard />
        <ServerCard s={s} onRefresh={refresh} />
      </div>
      <div className="flex flex-col gap-4 sm:gap-6">
        <UsageCard />
        <GmailCard />
        <FinanceCard />
        <TelegramCard enabled={s.telegram.enabled} />
        <RemindersCard />
        <ShortcutsCard />
      </div>
    </div>
  )
}
