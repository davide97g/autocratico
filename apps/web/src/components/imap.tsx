import * as React from "react"
import { GMAIL_NAME, IMAP_PRESETS } from "@autocratico/core"
import { CheckIcon, ExternalLinkIcon, InboxIcon, PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react"

import { Sensitive } from "@/components/privacy"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useI18n } from "@/i18n"
import { type ImapAccount, type ImapSetup, imapSetup, removeImapAccount, runJob, saveImapAccount } from "@/lib/api"

const PROVIDERS = [...IMAP_PRESETS.map((p) => p.id), "other"] as const

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

/** Lowercase, no accents, only the characters imap.toml accepts in a name. */
function slug(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[-_]+/, "")
    .slice(0, 32)
}

/** Add or edit one mailbox: the server signs in before saving anything. */
function Form({ setup, edit, onSaved, onClose }: { setup: ImapSetup; edit: ImapAccount | null; onSaved: () => void; onClose: () => void }) {
  const { t } = useI18n()
  const preset = IMAP_PRESETS.find((p) => p.host === edit?.host)
  const [provider, setProvider] = React.useState<string>(edit ? (preset?.id ?? "other") : "yahoo")
  const [name, setName] = React.useState(edit?.name ?? "yahoo")
  const [host, setHost] = React.useState(edit?.host ?? "")
  const [port, setPort] = React.useState(String(edit?.port ?? preset?.port ?? 993))
  const [user, setUser] = React.useState(edit?.user ?? "")
  const [password, setPassword] = React.useState("")
  const [folders, setFolders] = React.useState((edit?.folders ?? ["INBOX"]).join(", "))
  const [days, setDays] = React.useState(String(edit?.days ?? 365))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<string[] | null>(null)
  const [synced, setSynced] = React.useState(false)

  const chosen = IMAP_PRESETS.find((p) => p.id === provider)
  const server = chosen ? chosen.host : host.trim().toLowerCase()
  const list = folders
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean)
  const taken = !edit && setup.accounts.some((a) => a.name === name)
  const valid = GMAIL_NAME.test(name) && !taken && server && user.trim() && (password || edit) && list.length && Number(days) > 0

  if (done) {
    return (
      <div className="flex flex-col gap-4 rounded-lg border p-4">
        <span className="flex items-center gap-2 font-medium">
          <CheckIcon className="size-4 text-status-done" />
          {t.imap.saved}
        </span>
        {done.length > 0 && <p className="text-xs text-muted-foreground">{t.imap.available(done.join(", "))}</p>}
        {synced && <p className="text-sm text-muted-foreground">{t.imap.syncStarted}</p>}
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t.gmail.close}
          </Button>
          <Button
            disabled={synced}
            onClick={() => {
              // The first sync can take minutes: it runs on the server, Activity shows it.
              void runJob("imap").catch(() => undefined)
              setSynced(true)
            }}
          >
            <RefreshCwIcon data-icon="inline-start" />
            {t.imap.syncNow}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border p-4"
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        saveImapAccount({
          name,
          host: server,
          port: chosen ? chosen.port : Number(port) || 993,
          user: user.trim(),
          ...(password ? { password } : {}),
          folders: list,
          days: Number(days),
        })
          .then((r) => {
            setPassword("")
            setDone(r.folders)
            onSaved()
          }, (e: Error) => setError(e.message))
          .finally(() => setBusy(false))
      }}
    >
      <Field label={t.imap.provider}>
        <ToggleGroup value={[provider]} onValueChange={(v) => v[0] && setProvider(v[0])} className="self-start rounded-md bg-muted p-0.5">
          {PROVIDERS.map((p) => (
            <ToggleGroupItem key={p} value={p} size="sm" className="h-8 rounded-sm px-3 text-xs aria-pressed:bg-card">
              {t.imap.providers[p]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      {provider === "yahoo" && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm">
          <span className="min-w-0 flex-1">{t.imap.yahooHelp}</span>
          <Button variant="ghost" size="sm" render={<a href="https://login.yahoo.com/account/security" target="_blank" rel="noopener noreferrer" />} nativeButton={false}>
            <ExternalLinkIcon data-icon="inline-start" />
            {t.imap.yahooLink}
          </Button>
        </div>
      )}
      <Field label={t.imap.name} hint={taken ? t.gmail.nameTaken : t.imap.nameHint}>
        <Input value={name} onChange={(e) => setName(slug(e.target.value))} disabled={Boolean(edit)} maxLength={32} autoComplete="off" />
      </Field>
      {provider === "other" && (
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field label={t.imap.host}>
            <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="imap.example.com" spellCheck={false} autoComplete="off" />
          </Field>
          <Field label={t.imap.port}>
            <Input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={5} />
          </Field>
        </div>
      )}
      <Field label={t.imap.user}>
        <Input value={user} onChange={(e) => setUser(e.target.value)} type="email" spellCheck={false} autoComplete="off" />
      </Field>
      <Field label={t.imap.password} hint={edit ? `${t.imap.passwordHint} ${t.imap.passwordKeep}` : t.imap.passwordHint}>
        <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" maxLength={200} />
      </Field>
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <Field label={t.imap.folders} hint={t.imap.foldersHint}>
          <Input value={folders} onChange={(e) => setFolders(e.target.value)} spellCheck={false} autoComplete="off" />
        </Field>
        <Field label={t.imap.days}>
          <Input value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={4} />
        </Field>
      </div>
      {error && <p className="text-sm text-status-overdue">{error}</p>}
      <div className="flex justify-between gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          {t.imap.cancel}
        </Button>
        <Button type="submit" disabled={busy || !valid}>
          {busy ? t.imap.checking : t.imap.save}
        </Button>
      </div>
    </form>
  )
}

function AccountRow({ a, onEdit, onRemoved }: { a: ImapAccount; onEdit: () => void; onRemoved: () => void }) {
  const { t } = useI18n()
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 p-3 text-sm">
      <InboxIcon className="size-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{a.name}</span>
          <Badge className="shrink-0" variant={a.state === "connected" ? "secondary" : "outline"}>
            {t.imap.states[a.state]}
          </Badge>
        </span>
        {a.user && (
          <span className="truncate text-xs text-muted-foreground">
            <Sensitive>{a.user}</Sensitive>
          </span>
        )}
        <code className="truncate font-mono text-xs text-muted-foreground">
          {a.host} · {a.folders.join(", ")}
        </code>
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={t.imap.edit}>
          <PencilIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t.imap.remove}
          onClick={async () => {
            if (!window.confirm(t.imap.confirmRemove(a.name))) return
            await removeImapAccount(a.name)
            onRemoved()
          }}
        >
          <Trash2Icon />
        </Button>
      </div>
    </li>
  )
}

/** IMAP mailboxes in Settings (Yahoo, PEC, …), next to the Gmail accounts. */
export function ImapCard() {
  const { t } = useI18n()
  const [setup, setSetup] = React.useState<ImapSetup | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [form, setForm] = React.useState<{ edit: ImapAccount | null; key: number } | null>(null)
  const opened = React.useRef(0)
  const refresh = React.useCallback(() => {
    imapSetup().then(setSetup, (e: Error) => setError(e.message))
  }, [])
  React.useEffect(refresh, [refresh])

  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="text-lg font-medium tracking-tight">{t.imap.title}</CardTitle>
        <CardDescription>{t.imap.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-sm text-status-overdue">{error}</p>}
        {!setup && !error && <Skeleton className="h-16 rounded-lg" />}
        {setup && (
          <>
            {setup.accounts.length === 0 && !form && <p className="text-sm text-muted-foreground">{t.imap.none}</p>}
            {setup.accounts.length > 0 && (
              <ul className="flex flex-col gap-2">
                {setup.accounts.map((a) => (
                  <AccountRow key={a.name} a={a} onEdit={() => setForm({ edit: a, key: ++opened.current })} onRemoved={refresh} />
                ))}
              </ul>
            )}
            {form ? (
              <Form key={form.key} setup={setup} edit={form.edit} onSaved={refresh} onClose={() => setForm(null)} />
            ) : (
              <div className="flex border-t pt-4">
                <Button variant="secondary" onClick={() => setForm({ edit: null, key: ++opened.current })}>
                  <PlusIcon data-icon="inline-start" />
                  {t.imap.add}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
