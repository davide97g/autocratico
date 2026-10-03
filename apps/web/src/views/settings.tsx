import * as React from "react"
import { AlarmClockIcon, CopyIcon, KeyRoundIcon, LaptopIcon, PlayIcon, SendIcon, SmartphoneIcon } from "lucide-react"

import { Sensitive } from "@/components/privacy"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useI18n } from "@/i18n"
import {
  cancelReminder,
  createDevice,
  type Device,
  devices as loadDevices,
  type Reminder,
  reminders as loadReminders,
  revokeDevice,
  runJob,
  type Session,
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
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                <span className="font-medium">{t.activity.jobs[j.job] ?? j.job}</span>
                <span className="truncate text-xs text-muted-foreground">
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

function DevicesCard({ session }: { session: Session }) {
  const { t, locale } = useI18n()
  const [list, setList] = React.useState<Device[]>([])
  const [name, setName] = React.useState("")
  const [created, setCreated] = React.useState<{ label: string; value: string } | null>(null)
  const refresh = React.useCallback(() => {
    loadDevices().then(setList, () => undefined)
  }, [])
  React.useEffect(refresh, [refresh])

  async function create(scope: "full" | "ingest") {
    const r = await createDevice(name.trim() || (scope === "ingest" ? "shortcut" : "browser"), scope)
    setCreated(r.code ? { label: t.settings.codeIs, value: r.code } : { label: t.settings.tokenIs, value: r.token ?? "" })
    setName("")
    refresh()
  }

  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="text-lg font-medium tracking-tight">{t.settings.devices}</CardTitle>
        <CardDescription>{t.settings.devicesDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {list.length === 0 && <p className="text-sm text-muted-foreground">{t.settings.noDevices}</p>}
        <ul className="flex flex-col gap-2">
          {list.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-lg bg-muted/50 p-3 text-sm">
              {d.scope === "ingest" ? <SmartphoneIcon className="size-4 shrink-0" /> : <LaptopIcon className="size-4 shrink-0" />}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium">
                  {d.name}
                  {session.device?.id === d.id && <span className="ml-2 text-xs font-normal text-muted-foreground">({t.settings.thisDevice})</span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t.settings.scopes[d.scope]} · {t.settings.lastSeen(when(d.last_seen, locale, t.settings.never))}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (!window.confirm(t.settings.confirmRevoke)) return
                  await revokeDevice(d.id)
                  refresh()
                }}
              >
                {t.settings.revoke}
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3 border-t pt-4">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-muted-foreground">{t.settings.deviceName}</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.pair.namePlaceholder} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => create("full")}>
              <LaptopIcon data-icon="inline-start" />
              {t.settings.newDevice}
            </Button>
            <Button variant="secondary" onClick={() => create("ingest")}>
              <KeyRoundIcon data-icon="inline-start" />
              {t.settings.newShortcut}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t.settings.newDeviceHint}</p>
          <p className="text-xs text-muted-foreground">{t.settings.newShortcutHint}</p>
          {created && <Secret label={created.label} value={created.value} />}
        </div>
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

function RemindersCard() {
  const { t, locale } = useI18n()
  const [list, setList] = React.useState<Reminder[]>([])
  const refresh = React.useCallback(() => {
    loadReminders().then(setList, () => undefined)
  }, [])
  React.useEffect(refresh, [refresh])
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

export function Settings({ session }: { session: Session }) {
  const { t } = useI18n()
  const [s, setS] = React.useState<Status | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const refresh = React.useCallback(() => {
    loadStatus().then(setS, (e: Error) => setError(e.message))
  }, [])
  React.useEffect(refresh, [refresh])

  if (error) return <p className="text-sm text-status-overdue">{error}</p>
  if (!s) return <Skeleton className="h-72 rounded-xl" />
  return (
    <div className="grid items-start gap-6 @4xl:grid-cols-2">
      <div className="flex flex-col gap-6">
        <ServerCard s={s} onRefresh={refresh} />
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="text-lg font-medium tracking-tight">{t.settings.gmail}</CardTitle>
            <CardDescription>{t.settings.gmailDescription}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {s.gmail.map((g) => (
              <Badge key={g.name} variant={g.connected ? "secondary" : "outline"}>
                {g.name} · {g.connected ? t.settings.connected : t.settings.notConnected}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>
      <div className="flex flex-col gap-6">
        <TelegramCard enabled={s.telegram.enabled} />
        <RemindersCard />
        {session.auth === "prod" && <DevicesCard session={session} />}
      </div>
    </div>
  )
}
