import * as React from "react"
import { CarIcon, CheckIcon, HouseIcon, PlusIcon, SparklesIcon, XIcon } from "lucide-react"
import { cn } from "cn"

import { AddDocuments } from "@/components/add-documents"
import { LanguageSwitch } from "@/components/shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { useI18n } from "@/i18n"
import { ApiError, loadData, type ProfileInput, saveProfile, type Session, setOnboarded, setup, status, type Value } from "@/lib/api"
import { Hint, UsernameHint } from "@/views/login"

const MIN_PASSWORD = 8

type Row = Record<string, Value>
type Step = "welcome" | "name" | "password" | "profile" | "documents" | "done"
const ALL: Step[] = ["welcome", "name", "password", "profile", "documents", "done"]

/** 0–3: length and variety, enough to nudge towards a longer masterpass. */
function strength(p: string): number {
  if (p.length < MIN_PASSWORD) return 0
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^\w\s]/, /\s/].filter((r) => r.test(p)).length
  return Math.min(3, (p.length >= 12 ? 1 : 0) + (p.length >= 16 ? 1 : 0) + (kinds >= 3 ? 1 : 0))
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-2 text-sm", className)}>
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

const text = (v: Value | undefined) => (v === null || v === undefined ? "" : String(v))
const section = (v: unknown): Row => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {})
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : v && typeof v === "object" ? [v as Row] : [])

/**
 * First run: welcome, name, masterpass (creates the owner and logs in), basic profile, first
 * documents. When the owner already exists but never finished, it starts from the profile.
 */
export function Onboarding({ session, onDone }: { session: Session; onDone: (tour: boolean) => void }) {
  const { t } = useI18n()
  const steps = session.owner ? ALL.filter((s) => s !== "welcome" && s !== "name" && s !== "password") : ALL
  const [step, setStep] = React.useState<Step>(steps[0])
  const index = steps.indexOf(step)
  const go = (delta: number) => {
    setStep(steps[Math.min(steps.length - 1, Math.max(0, index + delta))])
    setError(null)
    window.scrollTo({ top: 0 })
  }

  // Account
  const [name, setName] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [code, setCode] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Profile, loaded once logged in (an existing register keeps what it has)
  const [person, setPerson] = React.useState<Row>({})
  const [work, setWork] = React.useState<Row>({})
  const [vehicles, setVehicles] = React.useState<Row[]>([])
  const [properties, setProperties] = React.useState<Row[]>([])
  const [agent, setAgent] = React.useState(true)
  const loaded = React.useRef(false)
  React.useEffect(() => {
    if (step !== "profile" || loaded.current) return
    loaded.current = true
    loadData().then(
      (d) => {
        setPerson(section(d.profile.person))
        setWork(section(d.profile.work))
        setVehicles(rows(d.profile.vehicle))
        setProperties(rows(d.profile.property))
      },
      () => undefined
    )
    status().then((s) => setAgent(s.claude), () => undefined)
  }, [step])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < MIN_PASSWORD) return setError(t.onboarding.tooShort(MIN_PASSWORD))
    if (password !== confirm) return setError(t.onboarding.mismatch)
    setBusy(true)
    setError(null)
    try {
      await setup({ name: name.trim(), password, code: session.needsCode ? code : undefined })
      setPassword("")
      setConfirm("")
      go(1)
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0
      setError(status === 403 ? t.onboarding.codeInvalid : status === 409 ? t.onboarding.alreadySetUp : (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function saveAndContinue() {
    setBusy(true)
    setError(null)
    const input: ProfileInput = { person, work, vehicle: vehicles, property: properties }
    try {
      await saveProfile(input)
      go(1)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function finish(tour: boolean) {
    setBusy(true)
    try {
      await setOnboarded(true)
      onDone(tour)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  const back = index > 0 && step !== "profile" && step !== "done" && (
    <Button variant="ghost" onClick={() => go(-1)}>
      {t.onboarding.back}
    </Button>
  )
  const score = strength(password)

  return (
    <div className="flex min-h-svh items-start justify-center px-gutter pt-safe pb-safe sm:items-center">
      <Card className="my-6 w-full max-w-lg rounded-xl">
        <CardHeader className="gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary font-mono text-sm font-semibold text-primary-foreground">
              A
            </span>
            <span className="mr-auto text-xs text-muted-foreground">{t.onboarding.step(index + 1, steps.length)}</span>
            <LanguageSwitch compact={false} />
          </div>
          <Progress value={((index + 1) / steps.length) * 100} aria-label={t.onboarding.step(index + 1, steps.length)} />
        </CardHeader>

        {step === "welcome" && (
          <>
            <CardHeader>
              <CardTitle className="text-2xl font-medium tracking-tight">{t.onboarding.welcomeTitle}</CardTitle>
              <CardDescription className="leading-relaxed">{t.onboarding.welcomeBody}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-3 text-sm">
                {t.onboarding.welcomePoints.map((p) => (
                  <li key={p} className="flex gap-3">
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-status-done" />
                    {p}
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="justify-end">
              <Button onClick={() => go(1)} autoFocus>
                {t.onboarding.start}
              </Button>
            </CardFooter>
          </>
        )}

        {step === "name" && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim()) go(1)
            }}
            className="flex flex-col gap-4 sm:gap-6"
          >
            <CardHeader>
              <CardTitle className="text-2xl font-medium tracking-tight">{t.onboarding.nameTitle}</CardTitle>
              <CardDescription>{t.onboarding.nameBody}</CardDescription>
            </CardHeader>
            <CardContent>
              <Field label={t.onboarding.name}>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.onboarding.namePlaceholder} autoComplete="name" maxLength={60} autoFocus />
              </Field>
            </CardContent>
            <CardFooter className="justify-between">
              {back}
              <Button type="submit" className="ml-auto" disabled={!name.trim()}>
                {t.onboarding.next}
              </Button>
            </CardFooter>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={create} className="flex flex-col gap-4 sm:gap-6">
            <CardHeader>
              <CardTitle className="text-2xl font-medium tracking-tight">{t.onboarding.passwordTitle}</CardTitle>
              <CardDescription className="leading-relaxed">{t.onboarding.passwordBody}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <UsernameHint />
              <Field label={t.onboarding.password}>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" maxLength={128} autoFocus />
              </Field>
              <div className="flex items-center gap-3" aria-live="polite">
                <div className="grid flex-1 grid-cols-4 gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className={cn("h-1 rounded-full", password && i <= score ? "bg-primary" : "bg-muted")} />
                  ))}
                </div>
                <span className="w-16 text-right text-xs text-muted-foreground">
                  {password.length < MIN_PASSWORD ? t.onboarding.tooShort(MIN_PASSWORD).replace(/\.$/, "") : t.onboarding.strength[score]}
                </span>
              </div>
              <Field label={t.onboarding.confirm}>
                <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" maxLength={128} />
              </Field>
              {session.needsCode && (
                <>
                  <Field label={t.onboarding.code}>
                    <Input
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={12}
                      className="font-mono tracking-widest"
                    />
                  </Field>
                  <Hint text={t.onboarding.codeHint} />
                </>
              )}
              {error && <Hint text={error} className="text-sm text-status-overdue" />}
            </CardContent>
            <CardFooter className="justify-between">
              {back}
              <Button
                type="submit"
                className="ml-auto"
                disabled={busy || password.length < MIN_PASSWORD || !confirm || (session.needsCode && code.replace(/\D/g, "").length < 8)}
              >
                {busy ? t.onboarding.saving : t.onboarding.create}
              </Button>
            </CardFooter>
          </form>
        )}

        {step === "profile" && (
          <>
            <CardHeader>
              <CardTitle className="text-2xl font-medium tracking-tight">{t.onboarding.profileTitle}</CardTitle>
              <CardDescription className="leading-relaxed">{t.onboarding.profileBody}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:gap-6">
              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="mb-3 text-sm font-medium">{t.onboarding.person}</legend>
                <Field label={t.onboarding.birthDate}>
                  <Input type="date" value={text(person.birth_date)} onChange={(e) => setPerson({ ...person, birth_date: e.target.value })} />
                </Field>
                <Field label={t.onboarding.municipality}>
                  <Input value={text(person.municipality)} onChange={(e) => setPerson({ ...person, municipality: e.target.value })} autoComplete="address-level2" />
                </Field>
                <Field label={t.onboarding.taxCode} className="sm:col-span-2">
                  <Input
                    value={text(person.tax_code)}
                    onChange={(e) => setPerson({ ...person, tax_code: e.target.value.toUpperCase() })}
                    className="font-mono uppercase"
                    maxLength={16}
                    autoComplete="off"
                  />
                </Field>
              </fieldset>

              <Separator />
              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="mb-3 text-sm font-medium">{t.onboarding.work}</legend>
                <Field label={t.onboarding.workType}>
                  <Input value={text(work.type)} onChange={(e) => setWork({ ...work, type: e.target.value })} placeholder={t.onboarding.workTypePlaceholder} />
                </Field>
                <Field label={t.onboarding.employer}>
                  <Input value={text(work.employer)} onChange={(e) => setWork({ ...work, employer: e.target.value })} autoComplete="organization" />
                </Field>
              </fieldset>

              <Separator />
              <Rows
                title={t.onboarding.vehicles}
                icon={CarIcon}
                rows={vehicles}
                onChange={setVehicles}
                blank={{ type: "", plate: "" }}
                render={(r, set) => (
                  <>
                    <Field label={t.onboarding.vehicleType}>
                      <Input value={text(r.type)} onChange={(e) => set({ type: e.target.value })} placeholder={t.onboarding.vehicleTypePlaceholder} />
                    </Field>
                    <Field label={t.onboarding.plate}>
                      <Input value={text(r.plate)} onChange={(e) => set({ plate: e.target.value.toUpperCase() })} className="font-mono uppercase" maxLength={10} />
                    </Field>
                    <Field label={t.onboarding.model}>
                      <Input value={text(r.model)} onChange={(e) => set({ model: e.target.value })} />
                    </Field>
                    <Field label={t.onboarding.registration}>
                      <Input type="date" value={text(r.registration_date)} onChange={(e) => set({ registration_date: e.target.value })} />
                    </Field>
                  </>
                )}
              />

              <Separator />
              <Rows
                title={t.onboarding.properties}
                icon={HouseIcon}
                rows={properties}
                onChange={setProperties}
                blank={{ name: "", municipality: "" }}
                render={(r, set) => (
                  <>
                    <Field label={t.onboarding.propertyName}>
                      <Input value={text(r.name)} onChange={(e) => set({ name: e.target.value })} placeholder={t.onboarding.propertyNamePlaceholder} />
                    </Field>
                    <Field label={t.onboarding.municipality}>
                      <Input value={text(r.municipality)} onChange={(e) => set({ municipality: e.target.value })} />
                    </Field>
                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <Checkbox checked={r.main_residence === true} onCheckedChange={(v) => set({ main_residence: v === true ? true : null })} />
                      {t.onboarding.mainResidence}
                    </label>
                  </>
                )}
              />
              {error && <p className="text-sm text-status-overdue">{error}</p>}
            </CardContent>
            <CardFooter className="justify-between gap-2">
              <Button variant="ghost" onClick={() => go(1)}>
                {t.onboarding.skip}
              </Button>
              <Button onClick={saveAndContinue} disabled={busy}>
                {busy ? t.onboarding.saving : t.onboarding.next}
              </Button>
            </CardFooter>
          </>
        )}

        {step === "documents" && (
          <>
            <CardHeader>
              <CardTitle className="text-2xl font-medium tracking-tight">{t.onboarding.documentsTitle}</CardTitle>
              <CardDescription className="leading-relaxed">{t.onboarding.documentsBody}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <AddDocuments onAdded={() => undefined} />
              {!agent && <p className="text-xs text-muted-foreground">{t.onboarding.noAgent}</p>}
              <p className="text-xs text-muted-foreground">{t.onboarding.documentsLater}</p>
            </CardContent>
            <CardFooter className="justify-between gap-2">
              <Button variant="ghost" onClick={() => go(-1)}>
                {t.onboarding.back}
              </Button>
              <Button onClick={() => go(1)}>{t.onboarding.next}</Button>
            </CardFooter>
          </>
        )}

        {step === "done" && (
          <>
            <CardHeader>
              <span className="mb-2 flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <SparklesIcon className="size-5" />
              </span>
              <CardTitle className="text-2xl font-medium tracking-tight">{t.onboarding.doneTitle}</CardTitle>
              <CardDescription>{t.onboarding.doneBody}</CardDescription>
            </CardHeader>
            {error && (
              <CardContent>
                <p className="text-sm text-status-overdue">{error}</p>
              </CardContent>
            )}
            <CardFooter className="justify-end gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => finish(false)}>
                {t.onboarding.finish}
              </Button>
              <Button disabled={busy} onClick={() => finish(true)} autoFocus>
                {t.onboarding.tour}
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  )
}

/** A list of profile rows (vehicles, properties), each a small form with its own remove button. */
function Rows({
  title,
  icon: Icon,
  rows,
  onChange,
  blank,
  render,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  rows: Row[]
  onChange: (rows: Row[]) => void
  blank: Row
  render: (row: Row, set: (patch: Row) => void) => React.ReactNode
}) {
  const { t } = useI18n()
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-sm font-medium">{title}</legend>
      {rows.map((r, i) => (
        <div key={i} className="flex gap-3 rounded-lg bg-muted/50 p-3">
          <Icon className="mt-8 size-4 shrink-0 text-muted-foreground" />
          <div className="grid flex-1 gap-3 sm:grid-cols-2">{render(r, (patch) => onChange(rows.map((x, j) => (j === i ? { ...x, ...patch } : x))))}</div>
          <Button variant="ghost" size="icon-sm" aria-label={t.onboarding.remove} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            <XIcon />
          </Button>
        </div>
      ))}
      <Button variant="secondary" size="sm" className="self-start" onClick={() => onChange([...rows, { ...blank }])}>
        <PlusIcon data-icon="inline-start" />
        {t.onboarding.add}
      </Button>
    </fieldset>
  )
}
