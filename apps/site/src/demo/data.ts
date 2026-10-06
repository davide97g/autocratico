// The made-up register the demo runs on: Maria Rossi, a Fiat Panda, a flat in Comune di Esempio.
// Dates are relative to today, or the next real occurrence for tax dates, so the colours always mean something.
import { addDays, endOfMonth, next, today, type Severity } from "../time.ts"

export type Area = "Casa" | "Veicoli" | "Fisco" | "Documenti"
export type View = "overview" | "deadlines" | "inbox" | "finance" | "activity"

export interface Deadline {
  id: string
  title: string
  area: Area
  severity: Severity
  /** null: the date is not known yet ("Date da inserire"). */
  date: Date | null
  /** undefined: not a payment; null: a payment whose amount is unknown. */
  amount?: number | null
  /** The amount is estimated from past occurrences (≈). */
  estimate?: boolean
  done?: boolean
  note?: string
}

export interface InboxItem {
  id: string
  icon: string
  title: string
  meta: string
  when: string
  status: "queued" | "working" | "filed" | "flagged"
}

export interface Commit {
  hash: string
  title: string
  when: string
  files: string[]
  diff: string
  undo?: () => void
  undone?: boolean
}

export const T0 = today()
export const YEAR = T0.getFullYear()
export const D = {
  carta: addDays(T0, 6),
  condominio: addDays(T0, 9),
  tari1: addDays(T0, 10),
  tari2: addDays(T0, 66),
  caldaia: addDays(T0, 25),
  gomme: addDays(T0, 40),
  irpef: next(11, 30),
  imu: next(12, 16),
  condominio2: addDays(T0, 101),
  rc: addDays(T0, 127),
  revisione: addDays(T0, 176),
  multa5: addDays(T0, 5),
  multa60: addDays(T0, 60),
  bollo: endOfMonth(),
  assemblea: addDays(T0, 16),
}

export const PERSON = { name: "Maria Rossi", initials: "MR", plate: "AB123CD", car: "Fiat Panda", town: "Comune di Esempio", street: "via Roma 12" }

export function baseDeadlines(): Deadline[] {
  return [
    { id: "carta", title: "Prenotare la carta d'identità", area: "Documenti", severity: "high", date: D.carta },
    { id: "condominio", title: "Rata condominio", area: "Casa", severity: "medium", date: D.condominio, amount: 180 },
    { id: "caldaia", title: "Manutenzione caldaia", area: "Casa", severity: "medium", date: D.caldaia, amount: 120, estimate: true },
    { id: "gomme", title: "Gomme invernali", area: "Veicoli", severity: "low", date: D.gomme },
    {
      id: "irpef",
      title: "Secondo acconto IRPEF",
      area: "Fisco",
      severity: "high",
      date: D.irpef,
      amount: 320,
      note: "Solo se il 730 lo prevede: trattenuto dalla busta paga di novembre.",
    },
    { id: "imu", title: "IMU, saldo", area: "Casa", severity: "high", date: D.imu, amount: 405, estimate: true },
    { id: "condominio-2", title: "Rata condominio", area: "Casa", severity: "medium", date: D.condominio2, amount: 180 },
    { id: "rc", title: "Rinnovo RC auto", area: "Veicoli", severity: "high", date: D.rc, amount: null },
    { id: "revisione", title: "Revisione auto", area: "Veicoli", severity: "medium", date: D.revisione, amount: 79.02 },
    { id: "tari", title: "TARI", area: "Casa", severity: "medium", date: null },
    { id: "passaporto", title: "Scadenza passaporto", area: "Documenti", severity: "medium", date: null },
  ]
}

export function baseInbox(): InboxItem[] {
  return [
    { id: "estratto", icon: "mail", title: "Estratto conto condominio, 3° trimestre", meta: "Gmail · Amministrazioni Bianchi", when: "ieri", status: "filed" },
    { id: "ricevuta", icon: "camera", title: "Ricevuta revisione", meta: "Telegram · foto", when: "2 ott", status: "filed" },
    { id: "foto-cie", icon: "smartphone", title: "Foto tessera per la carta d'identità", meta: "Condividi da iPhone", when: "30 set", status: "filed" },
  ]
}

const add = (lines: string[]) => lines.map((l) => `<span class="add">+ ${l}</span>`).join("\n")

export function baseCommits(): Commit[] {
  return [
    {
      hash: "9b77c30",
      title: "Agente: estratto conto del condominio, rata del mese",
      when: "ieri, 18:02",
      files: ["deadlines.toml", "cases/2026-condominio/README.md"],
      diff: `<span class="file">deadlines.toml</span>\n${add(['amounts = { "…" = <span class="s">180.00</span> }'])}`,
    },
    {
      hash: "e1c798b",
      title: "Profilo: targa e modello della Panda",
      when: "2 ott, 21:14",
      files: ["profile.toml"],
      diff: `<span class="file">profile.toml</span>\n${add(["[[vehicle]]", 'model = "Fiat Panda"', 'plate = "<span class="s">AB123CD</span>"'])}`,
    },
    {
      hash: "6016a7a",
      title: "Inizio del registro",
      when: "28 set, 12:56",
      files: ["deadlines.toml", "profile.toml", "state.json", "cases/2026-carta-identita/README.md"],
      diff: `<span class="file">deadlines.toml</span>\n${add(["[[deadline]]", 'id = "carta-identita"', 'title = "Prenotare la carta d\'identità"', "…"])}`,
    },
  ]
}

/** This month in the finance app, mirrored by the server. */
export const SPENDING = [
  { name: "Casa", value: 612.4 },
  { name: "Spesa", value: 286.1 },
  { name: "Svago", value: 120 },
  { name: "Trasporti", value: 98 },
  { name: "Salute", value: 45.9 },
]
export const EARNINGS = 2150

/** Broker snapshots from screenshots and exports. */
export const HOLDINGS = [
  { name: "Vanguard FTSE All-World", where: "Trade Republic", value: 3820.8, gain: 280.8 },
  { name: "iShares Core MSCI World", where: "Degiro", value: 1585.5, gain: 85.5 },
  { name: "BTP Italia 2030", where: "Degiro", value: 1010, gain: 10 },
]
export const CASH = 220
export const PORTFOLIO = [5810, 5930, 5890, 6080, 6210, 6150, 6390, 6520, 6480, 6636.3]
