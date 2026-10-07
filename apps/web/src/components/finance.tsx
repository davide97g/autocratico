import * as React from "react"
import { CSV_DATE_FORMATS, type FinanceConnectorKind, type FinanceCsvMapping } from "@autocratico/core"
import { ChartLineIcon, RefreshCwIcon, UnplugIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useI18n } from "@/i18n"
import {
  ApiError,
  connectFinance,
  disconnectFinance,
  type FinanceData,
  type FinanceSetup,
  financeSetup,
  type Occurrence,
  recordExpense,
  removeExpense,
  syncFinance,
} from "@/lib/api"

const CONNECTORS: FinanceConnectorKind[] = ["http", "csv"]
const DEFAULT_CSV: FinanceCsvMapping = {
  date: "Date",
  amount: "Amount",
  description: "Description",
  delimiter: ",",
  decimal: ".",
  date_format: "YYYY-MM-DD",
  expense_sign: "negative",
}

function since(iso: string | null, locale: string) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

/** A labelled select over fixed options. */
function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={(v) => v && onChange(v as T)} items={options}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}

/**
 * Settings: the finance source. A finance server (address and API token: the token is sent once and never
 * shown again) or bank exports in CSV (which column is which). Sync state on top.
 */
export function FinanceCard() {
  const { t, locale } = useI18n()
  const [setup, setSetup] = React.useState<FinanceSetup | null>(null)
  const [connector, setConnector] = React.useState<FinanceConnectorKind>("http")
  const [url, setUrl] = React.useState("")
  const [token, setToken] = React.useState("")
  const [csv, setCsv] = React.useState<FinanceCsvMapping>(DEFAULT_CSV)
  const [busy, setBusy] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)

  const refresh = React.useCallback(() => {
    financeSetup().then((s) => {
      setSetup(s)
      if (s.connector) setConnector(s.connector)
      setUrl((u) => u || s.url || "")
      if (s.csv) setCsv({ ...DEFAULT_CSV, ...s.csv })
    }, (e: Error) => setProblem(e.message))
  }, [])
  React.useEffect(refresh, [refresh])

  async function act(fn: () => Promise<unknown>) {
    setBusy(true)
    setProblem(null)
    try {
      await fn()
      refresh()
    } catch (e) {
      setProblem(e instanceof ApiError || e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    await act(async () => {
      if (connector === "http") {
        setSetup(await connectFinance({ connector, url: url.trim(), ...(token.trim() ? { token: token.trim() } : {}) }))
        setToken("")
      } else {
        const category = csv.category?.trim()
        setSetup(await connectFinance({ connector, csv: { ...csv, category: category || undefined } }))
      }
    })
  }

  const field = (key: "date" | "amount" | "description" | "category", label: string, required = true) => (
    <label className="flex flex-col gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Input value={csv[key] ?? ""} onChange={(e) => setCsv((m) => ({ ...m, [key]: e.target.value }))} required={required} maxLength={100} />
    </label>
  )
  const options = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }))
  const sameSource = setup?.connected && setup.connector === connector

  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-medium tracking-tight">
          <ChartLineIcon className="size-4" />
          {t.finance.title}
        </CardTitle>
        <CardDescription>{t.finance.description}</CardDescription>
        {setup?.connected && (
          <CardAction>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(syncFinance)}>
              <RefreshCwIcon data-icon="inline-start" />
              {t.finance.sync}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!setup ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : (
          <>
            {setup.connected && (
              <div className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3 text-sm">
                <span className="font-medium">
                  {setup.connector && t.finance.connectors[setup.connector]} · {setup.live ? t.finance.live : t.finance.hourly} ·{" "}
                  {t.finance.syncedAt(since(setup.synced_at, locale))}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t.finance.counts(setup.counts.transactions, setup.counts.categories, setup.counts.recurring)}
                </span>
                {setup.capabilities && !setup.capabilities.write && <span className="text-xs text-muted-foreground">{t.finance.readOnly}</span>}
                {setup.error && <span className="text-xs text-status-overdue">{setup.error}</span>}
              </div>
            )}
            <form onSubmit={save} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Choice label={t.finance.connector} value={connector} options={CONNECTORS.map((c) => ({ value: c, label: t.finance.connectors[c] }))} onChange={setConnector} />
                <span className="text-xs text-muted-foreground">{t.finance.connectorHint[connector]}</span>
              </div>
              {connector === "http" ? (
                <>
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-muted-foreground">{t.finance.url}</span>
                    <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" required maxLength={300} />
                    <span className="text-xs text-muted-foreground">{t.finance.urlHint}</span>
                  </label>
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-muted-foreground">{t.finance.token}</span>
                    <Input
                      type="password"
                      autoComplete="off"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder={sameSource ? t.finance.tokenSaved : undefined}
                      required={!sameSource}
                      maxLength={512}
                    />
                    <span className="text-xs text-muted-foreground">{t.finance.tokenHelp}</span>
                  </label>
                </>
              ) : (
                <div className="flex flex-col gap-3">
                  <span className="text-sm text-muted-foreground">{t.finance.csvColumns}</span>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {field("date", t.finance.csvDate)}
                    {field("amount", t.finance.csvAmount)}
                    {field("description", t.finance.csvDescription)}
                    {field("category", t.finance.csvCategory, false)}
                    <Choice label={t.finance.csvDelimiter} value={csv.delimiter} options={options(t.finance.delimiters) as { value: FinanceCsvMapping["delimiter"]; label: string }[]} onChange={(delimiter) => setCsv((m) => ({ ...m, delimiter }))} />
                    <Choice label={t.finance.csvDecimal} value={csv.decimal} options={options(t.finance.decimals) as { value: FinanceCsvMapping["decimal"]; label: string }[]} onChange={(decimal) => setCsv((m) => ({ ...m, decimal }))} />
                    <Choice label={t.finance.csvDateFormat} value={csv.date_format} options={CSV_DATE_FORMATS.map((f) => ({ value: f, label: f }))} onChange={(date_format) => setCsv((m) => ({ ...m, date_format }))} />
                    <Choice label={t.finance.csvSign} value={csv.expense_sign} options={options(t.finance.signs) as { value: FinanceCsvMapping["expense_sign"]; label: string }[]} onChange={(expense_sign) => setCsv((m) => ({ ...m, expense_sign }))} />
                  </div>
                </div>
              )}
              {problem && <p className="text-sm text-status-overdue">{problem}</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>
                  {sameSource ? t.finance.save : t.finance.connect}
                </Button>
                {setup.connected && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => window.confirm(t.finance.confirmDisconnect) && act(disconnectFinance)}
                  >
                    <UnplugIcon data-icon="inline-start" />
                    {t.finance.disconnect}
                  </Button>
                )}
              </div>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export type ExpenseAsk = { o: Occurrence; mode: "record" | "remove"; finance: FinanceData; doneOn: string | null }

/**
 * After an occurrence with an amount is marked done: offer to record it as an expense in the finance source
 * (only sources that can write).
 * After it is marked not done again: offer to delete the expense recorded for it. Never automatic.
 */
export function ExpenseDialog({ ask, onClose }: { ask: ExpenseAsk | null; onClose: () => void }) {
  return (
    <Dialog open={ask !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>{ask && <ExpenseForm key={`${ask.mode}:${ask.o.key}`} ask={ask} onClose={onClose} />}</DialogContent>
    </Dialog>
  )
}

function ExpenseForm({ ask, onClose }: { ask: ExpenseAsk; onClose: () => void }) {
  const { t } = useI18n()
  const categories = React.useMemo(
    () => (ask.finance.mirror?.categories ?? []).filter((c) => c.type === "expense").sort((a, b) => a.name.localeCompare(b.name)),
    [ask]
  )
  const [amount, setAmount] = React.useState(() => (ask.o.amount != null ? String(ask.o.amount) : ""))
  const [date, setDate] = React.useState(() => ask.doneOn ?? ask.finance.today)
  const [category, setCategory] = React.useState<string | null>(() => {
    const tied = ask.finance.deadlines.find((d) => d.id === ask.o.id)?.finance_category ?? null
    return tied && categories.some((c) => c.id === tied) ? tied : null
  })
  const [description, setDescription] = React.useState(ask.o.title)
  const [busy, setBusy] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const record = ask.mode === "record"

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setProblem(null)
    try {
      if (record) {
        const value = Number(amount.replace(",", "."))
        if (!category || !(value > 0)) return
        await recordExpense({ key: ask.o.key, date, amount: Math.round(value * 100) / 100, category, description: description.trim().slice(0, 200) })
      } else {
        await removeExpense(ask.o.key)
      }
      onClose()
    } catch (err) {
      setProblem((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{record ? t.finance.recordTitle : t.finance.removeTitle}</DialogTitle>
        <DialogDescription>
          {ask.o.title} — {record ? t.finance.recordDescription : t.finance.removeDescription}
        </DialogDescription>
      </DialogHeader>
      {record && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-muted-foreground">{t.finance.amount}</span>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-muted-foreground">{t.finance.date}</span>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-2 text-sm sm:col-span-2">
            <span className="text-muted-foreground">{t.finance.category}</span>
            <Select value={category} onValueChange={(v) => setCategory(v as string | null)} items={categories.map((c) => ({ value: c.id, label: c.name }))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t.finance.chooseCategory} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-2 text-sm sm:col-span-2">
            <span className="text-muted-foreground">{t.finance.descriptionLabel}</span>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
          </label>
        </div>
      )}
      {problem && <p className="text-sm text-status-overdue">{problem}</p>}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {record ? t.finance.notNow : t.finance.keep}
        </Button>
        <Button type="submit" variant={record ? "default" : "destructive"} disabled={busy || (record && !category)}>
          {record ? t.finance.record : t.finance.remove}
        </Button>
      </DialogFooter>
    </form>
  )
}
