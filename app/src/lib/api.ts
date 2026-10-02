export type Area =
  | "tax"
  | "home"
  | "vehicles"
  | "documents"
  | "health"
  | "social-security"
  | "bank"
  | "family"
  | "business"
  | (string & {})

export type Occurrence = {
  key: string
  id: string
  title: string
  area: Area
  date: string
  days: number
  done_on: string | null
  repeat: string
  severity: "high" | "medium" | "low"
  amount: number | null
  sensitive: boolean
  case: string | null
  notes: string
  source: string
}

export type Incomplete = {
  id: string
  title: string
  area: Area
  severity: "high" | "medium" | "low"
  notes: string
}

export type Case = {
  slug: string
  title: string
  status: string
  done: number
  total: number
  md: string
}

export type CatalogEntry = { name: string; title: string; md: string }

export type Value = string | number | boolean | null
export type Profile = Record<string, Record<string, Value> | Array<Record<string, Value>>>

export type Data = {
  today: string
  agenda: Occurrence[]
  incomplete: Incomplete[]
  cases: Case[]
  profile: Profile
  catalog: CatalogEntry[]
}

export async function loadData(): Promise<Data> {
  const r = await fetch("/api/data")
  const body = await r.json()
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`)
  return body
}

export async function markDone(key: string, done: boolean): Promise<string | null> {
  const r = await fetch("/api/done", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, done }),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const { done_on } = await r.json()
  return done_on
}
