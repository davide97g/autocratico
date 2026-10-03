// Prints the waitlist as CSV on stdout: node src/export.ts > waitlist.csv
// (DATABASE_URL or the PG* variables, as for the server).
import postgres from "postgres"

const url = process.env.DATABASE_URL
const sql = url ? postgres(url, { max: 1 }) : postgres({ max: 1 })
const rows = await sql<{ email: string; created_at: Date; locale: string | null; source: Record<string, string> }[]>`
  select email, created_at, locale, source from waitlist order by created_at`
// Quoted, and a leading = + - @ neutralised: spreadsheets would run it as a formula.
const cell = (v: string) => {
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v
  return /[",\n']/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}
process.stdout.write("email,created_at,locale,utm_source,utm_medium,utm_campaign\n")
for (const r of rows) {
  const s = r.source ?? {}
  const line = [r.email, r.created_at.toISOString(), r.locale ?? "", s.utm_source ?? "", s.utm_medium ?? "", s.utm_campaign ?? ""]
  process.stdout.write(line.map(cell).join(",") + "\n")
}
await sql.end()
