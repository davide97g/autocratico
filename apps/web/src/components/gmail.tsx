import * as React from "react"
import { GMAIL_DEFAULT_QUERY, GMAIL_NAME, GMAIL_REDIRECT_PATH } from "@autocratico/core"
import { CheckIcon, CopyIcon, ExternalLinkIcon, LogInIcon, MailIcon, PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon, UploadIcon } from "lucide-react"

import { Sensitive } from "@/components/privacy"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useI18n } from "@/i18n"
import {
  authorizeGmail,
  completeGmail,
  type GmailAccount,
  type GmailSetup,
  gmailSetup,
  removeGmailAccount,
  runJob,
  saveGmailAccount,
  saveGmailClient,
} from "@/lib/api"
import { finishGmailReturn, hasGmailReturn } from "@/lib/gmail"

const STEPS = ["cloud", "client", "account", "signin", "done"] as const
type Step = (typeof STEPS)[number]
type Start = { step: Step; name?: string; query?: string; edit?: boolean; returning?: boolean }

const REDIRECT = `${window.location.origin}${GMAIL_REDIRECT_PATH}`

/** Lowercase, no accents, only the characters gmail.toml accepts in a name. */
function slug(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[-_]+/, "")
    .slice(0, 32)
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
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

function Problem({ text }: { text: string | null }) {
  return text ? <p className="text-sm text-status-overdue">{text}</p> : null
}

function Stepper({ step }: { step: Step }) {
  const { t } = useI18n()
  const index = STEPS.indexOf(step)
  return (
    <div className="flex flex-col gap-2">
      <ol className="flex items-center gap-1.5" aria-label={t.gmail.step(index + 1, STEPS.length)}>
        {STEPS.map((s, i) => (
          <li key={s} className={i < STEPS.length - 1 ? "flex flex-1 items-center gap-1.5" : "flex items-center"} aria-current={i === index ? "step" : undefined}>
            <span
              className={
                i <= index
                  ? "flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-xs text-primary-foreground"
                  : "flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-xs text-muted-foreground"
              }
            >
              {i < index ? <CheckIcon className="size-3.5" /> : i + 1}
            </span>
            {i < STEPS.length - 1 && <span className={i < index ? "h-px flex-1 bg-primary" : "h-px flex-1 bg-border"} />}
          </li>
        ))}
      </ol>
      <span className="text-xs text-muted-foreground">
        {t.gmail.step(index + 1, STEPS.length)} · {t.gmail.steps[index]}
      </span>
    </div>
  )
}

/** The setup, one step at a time: Google Cloud, OAuth client, account, sign-in, done. */
function Wizard({ setup, start, onChanged, onClose }: { setup: GmailSetup; start: Start; onChanged: () => void; onClose: () => void }) {
  const { t } = useI18n()
  const [step, setStep] = React.useState<Step>(start.step)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(Boolean(start.returning))
  // OAuth client
  const [type, setType] = React.useState<"web" | "installed">(setup.client?.type ?? "web")
  const [file, setFile] = React.useState("")
  const [saved, setSaved] = React.useState<GmailSetup["client"]>(null)
  const upload = React.useRef<HTMLInputElement>(null)
  // account
  const [name, setName] = React.useState(start.name ?? "")
  const [query, setQuery] = React.useState(start.query ?? GMAIL_DEFAULT_QUERY)
  // sign-in
  const [clientType, setClientType] = React.useState(setup.client?.type ?? "web")
  const [opened, setOpened] = React.useState(false)
  const [pasted, setPasted] = React.useState("")
  const [done, setDone] = React.useState<{ name: string; address: string } | null>(null)
  const [synced, setSynced] = React.useState(false)

  const go = (s: Step) => {
    setError(null)
    setStep(s)
  }
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
  const finished = (r: { name: string; address: string }) => {
    setDone(r)
    setStep("done")
    onChanged()
  }

  // Back from Google with a web client: finish the sign-in the browser was sent away for.
  React.useEffect(() => {
    if (!start.returning) return
    const finishing = finishGmailReturn() ?? Promise.reject(new Error(t.gmail.expired))
    finishing.then(finished, (e: Error) => setError(e.message)).finally(() => setBusy(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start.returning])

  const existing = setup.accounts.find((a) => a.name === name)
  const validName = GMAIL_NAME.test(name)

  return (
    <div className="flex flex-col gap-5 rounded-lg border p-4">
      <Stepper step={step} />

      {step === "cloud" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="font-medium">{t.gmail.cloudTitle}</span>
            <span className="text-sm text-muted-foreground">{t.gmail.cloudBody}</span>
          </div>
          <ol className="flex flex-col gap-2">
            {t.gmail.cloudSteps.map((s, i) => (
              <li key={s.url} className="flex items-start gap-3 rounded-lg bg-muted/50 p-3 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-card font-mono text-xs">{i + 1}</span>
                <span className="min-w-0 flex-1 leading-relaxed">{s.text}</span>
                <Button variant="ghost" size="sm" render={<a href={s.url} target="_blank" rel="noopener noreferrer" />} nativeButton={false}>
                  <ExternalLinkIcon data-icon="inline-start" />
                  {t.gmail.open}
                </Button>
              </li>
            ))}
          </ol>
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t.gmail.cancel}
            </Button>
            <Button onClick={() => go("client")}>{t.gmail.next}</Button>
          </div>
        </div>
      )}

      {step === "client" && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            let parsed: unknown
            try {
              parsed = JSON.parse(file)
            } catch {
              return setError(t.gmail.notJson)
            }
            void attempt(async () => {
              const client = await saveGmailClient(parsed)
              setSaved(client)
              setClientType(client?.type ?? "web")
              onChanged()
              if (client?.type === "web" && !client.redirects.includes(REDIRECT)) return // stays here to show the warning
              go("account")
            })
          }}
        >
          <div className="flex flex-col gap-1">
            <span className="font-medium">{t.gmail.clientTitle}</span>
            <span className="text-sm text-muted-foreground">{t.gmail.clientBody}</span>
          </div>
          <ToggleGroup value={[type]} onValueChange={(v) => v[0] && setType(v[0] as "web" | "installed")} className="self-start rounded-md bg-muted p-0.5">
            {(["web", "installed"] as const).map((k) => (
              <ToggleGroupItem key={k} value={k} size="sm" className="h-8 rounded-sm px-3 text-xs aria-pressed:bg-card">
                {k === "web" ? t.gmail.clientWeb : t.gmail.clientDesktop}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {type === "web" ? (
            <div className="flex flex-col gap-2 text-sm">
              <span className="text-muted-foreground">{t.gmail.clientWebHint}</span>
              <CopyField value={REDIRECT} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t.gmail.clientDesktopHint}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" render={<a href="https://console.cloud.google.com/auth/clients/create" target="_blank" rel="noopener noreferrer" />} nativeButton={false}>
              <ExternalLinkIcon data-icon="inline-start" />
              {t.gmail.openClients}
            </Button>
            <Button type="button" variant="secondary" onClick={() => upload.current?.click()}>
              <UploadIcon data-icon="inline-start" />
              {t.gmail.upload}
            </Button>
            <input
              ref={upload}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ""
                if (f) void f.text().then(setFile)
              }}
            />
          </div>
          <Field label={t.gmail.paste}>
            <Textarea
              value={file}
              onChange={(e) => setFile(e.target.value)}
              rows={4}
              spellCheck={false}
              autoComplete="off"
              className="font-mono text-xs"
              placeholder='{"web":{"client_id":"…"}}'
            />
          </Field>
          {saved && (
            <p className="text-sm text-status-done">
              {t.gmail.clientSaved}
              {saved.type === "web" && !saved.redirects.includes(REDIRECT) && <span className="mt-1 block text-status-soon">{t.gmail.redirectMissing}</span>}
            </p>
          )}
          <Problem text={error} />
          <div className="flex justify-between gap-2">
            <Button type="button" variant="ghost" onClick={() => go("cloud")}>
              {t.gmail.back}
            </Button>
            <div className="flex gap-2">
              {saved && (
                <Button type="button" onClick={() => go("account")}>
                  {t.gmail.next}
                </Button>
              )}
              {!saved && (
                <Button type="submit" disabled={busy || !file.trim()}>
                  {t.gmail.saveClient}
                </Button>
              )}
            </div>
          </div>
        </form>
      )}

      {step === "account" && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void attempt(async () => {
              await saveGmailAccount({ name, query: query.trim() })
              onChanged()
              if (start.edit && existing?.state === "connected") return onClose()
              go("signin")
            })
          }}
        >
          <div className="flex flex-col gap-1">
            <span className="font-medium">{t.gmail.accountTitle}</span>
            <span className="text-sm text-muted-foreground">{t.gmail.accountBody}</span>
          </div>
          <Field label={t.gmail.name} hint={!start.edit && existing ? t.gmail.nameTaken : t.gmail.nameHint}>
            <Input
              value={name}
              onChange={(e) => setName(slug(e.target.value))}
              placeholder={t.gmail.namePlaceholder}
              disabled={start.edit}
              maxLength={32}
              autoComplete="off"
              autoFocus={!start.edit}
            />
          </Field>
          <Field label={t.gmail.query} hint={t.gmail.queryHint}>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={500} spellCheck={false} autoComplete="off" className="font-mono text-xs" />
          </Field>
          <Problem text={error} />
          <div className="flex justify-between gap-2">
            <Button type="button" variant="ghost" onClick={start.step === "account" ? onClose : () => go("client")}>
              {start.step === "account" ? t.gmail.cancel : t.gmail.back}
            </Button>
            <Button type="submit" disabled={busy || !validName || !query.trim()}>
              {t.gmail.saveAccount}
            </Button>
          </div>
        </form>
      )}

      {step === "signin" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="font-medium">{t.gmail.signInTitle}</span>
            {!start.returning && <span className="text-sm text-muted-foreground">{t.gmail.signInBody(name)}</span>}
            <span className="text-xs text-muted-foreground">{t.gmail.unverified}</span>
          </div>
          {start.returning && busy && <p className="text-sm text-muted-foreground">{t.gmail.finishing}</p>}
          {!start.returning && (
            <Button
              className="self-start"
              disabled={busy}
              onClick={() =>
                void attempt(async () => {
                  const { url, type: kind } = await authorizeGmail(name)
                  setClientType(kind)
                  // A web client comes back to this app at /oauth/gmail; a desktop one needs the address pasted.
                  if (kind === "web") window.location.assign(url)
                  else {
                    window.open(url, "_blank", "noopener,noreferrer")
                    setOpened(true)
                  }
                })
              }
            >
              <LogInIcon data-icon="inline-start" />
              {t.gmail.signIn}
            </Button>
          )}
          {clientType === "installed" && opened && (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                void attempt(async () => finished(await completeGmail(pasted.trim())))
              }}
            >
              <Field label={t.gmail.pasteLabel}>
                <Input value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="http://127.0.0.1:…/?state=…&code=…" spellCheck={false} autoComplete="off" />
              </Field>
              <Button type="submit" className="self-start" disabled={busy || !pasted.trim()}>
                {busy ? t.gmail.finishing : t.gmail.finish}
              </Button>
            </form>
          )}
          <Problem text={error} />
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={start.returning || start.step === "signin" ? onClose : () => go("account")}>
              {start.returning || start.step === "signin" ? t.gmail.close : t.gmail.back}
            </Button>
          </div>
        </div>
      )}

      {step === "done" && done && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-2 font-medium">
              <CheckIcon className="size-4 text-status-done" />
              {t.gmail.doneTitle}
            </span>
            <span className="text-sm text-muted-foreground">{t.gmail.doneBody}</span>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/50 p-3 text-sm">
            <span className="font-medium">{done.name}</span>
            {done.address && (
              <span className="min-w-0 truncate text-muted-foreground">
                <Sensitive>{done.address}</Sensitive>
              </span>
            )}
          </div>
          {synced && <p className="text-sm text-muted-foreground">{t.gmail.syncStarted}</p>}
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t.gmail.close}
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setName("")
                  setQuery(GMAIL_DEFAULT_QUERY)
                  setDone(null)
                  setSynced(false)
                  setOpened(false)
                  setPasted("")
                  go("account")
                }}
              >
                <PlusIcon data-icon="inline-start" />
                {t.gmail.addAnother}
              </Button>
              <Button
                disabled={synced}
                onClick={() => {
                  // The first sync can take minutes: it runs on the server, Activity shows it.
                  void runJob("gmail").catch(() => undefined)
                  setSynced(true)
                }}
              >
                <RefreshCwIcon data-icon="inline-start" />
                {t.gmail.syncNow}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AccountRow({ a, onConnect, onEdit, onRemoved }: { a: GmailAccount; onConnect: () => void; onEdit: () => void; onRemoved: () => void }) {
  const { t } = useI18n()
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 p-3 text-sm">
      <MailIcon className="size-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{a.name}</span>
          <Badge className="shrink-0" variant={a.state === "connected" ? "secondary" : "outline"}>{t.gmail.states[a.state]}</Badge>
        </span>
        {a.address && (
          <span className="truncate text-xs text-muted-foreground">
            <Sensitive>{a.address}</Sensitive>
          </span>
        )}
        <code className="truncate font-mono text-xs text-muted-foreground">{a.query}</code>
      </div>
      <div className="flex gap-1">
        {a.state !== "connected" && (
          <Button variant="secondary" size="sm" onClick={onConnect}>
            <LogInIcon data-icon="inline-start" />
            {a.state === "reconnect" ? t.gmail.reconnect : t.gmail.connect}
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={t.gmail.edit}>
          <PencilIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t.gmail.remove}
          onClick={async () => {
            if (!window.confirm(t.gmail.confirmRemove(a.name))) return
            await removeGmailAccount(a.name)
            onRemoved()
          }}
        >
          <Trash2Icon />
        </Button>
      </div>
    </li>
  )
}

/** Gmail accounts in Settings, with the setup wizard. */
export function GmailCard() {
  const { t } = useI18n()
  const [setup, setSetup] = React.useState<GmailSetup | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  // Back from Google's sign-in: the wizard opens where it left off.
  const [wizard, setWizard] = React.useState<(Start & { key: number }) | null>(() =>
    hasGmailReturn() ? { step: "signin", returning: true, key: 0 } : null
  )
  const opened = React.useRef(0)
  const refresh = React.useCallback(() => {
    gmailSetup().then(setSetup, (e: Error) => setError(e.message))
  }, [])
  React.useEffect(refresh, [refresh])

  const open = (s: Start) => setWizard({ ...s, key: ++opened.current })
  const fresh = (): Start => ({ step: setup?.client ? "account" : "cloud" })

  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="text-lg font-medium tracking-tight">{t.gmail.title}</CardTitle>
        <CardDescription>{t.gmail.description}</CardDescription>
      </CardHeader>
      <CardContent className="@container flex flex-col gap-4">
        {error && <p className="text-sm text-status-overdue">{error}</p>}
        {!setup && !error && <Skeleton className="h-24 rounded-lg" />}
        {setup && (
          <>
            {setup.accounts.length === 0 && !wizard && <p className="text-sm text-muted-foreground">{t.gmail.none}</p>}
            {setup.accounts.length > 0 && (
              <ul className="flex flex-col gap-2">
                {setup.accounts.map((a) => (
                  <AccountRow
                    key={a.name}
                    a={a}
                    // Without a client yet, the wizard starts from Google Cloud and comes back to this account.
                    onConnect={() => open(setup.client ? { step: "signin", name: a.name } : { step: "cloud", name: a.name, query: a.query })}
                    onEdit={() => open({ step: "account", name: a.name, query: a.query, edit: true })}
                    onRemoved={refresh}
                  />
                ))}
              </ul>
            )}
            {wizard ? (
              <Wizard key={wizard.key} setup={setup} start={wizard} onChanged={refresh} onClose={() => setWizard(null)} />
            ) : (
              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <Button variant="secondary" onClick={() => open(fresh())}>
                  <PlusIcon data-icon="inline-start" />
                  {t.gmail.add}
                </Button>
                <span className="ml-auto truncate text-xs text-muted-foreground">
                  {setup.client ? t.gmail.client(setup.client.type === "web" ? t.gmail.clientWeb : t.gmail.clientDesktop, setup.client.project) : t.gmail.noClient}
                </span>
                {setup.client && (
                  <Button variant="ghost" size="sm" onClick={() => open({ step: "client" })}>
                    {t.gmail.replaceClient}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
