// The register's files as text, for the patches Activity shows: deadlines.toml blocks, profile.toml,
// and a small line diff between two versions.
import type { Deadline, Profile } from "@autocratico/core"

const q = (s: string) => JSON.stringify(s)
const num = (n: number) => (Number.isInteger(n) ? `${n}.00` : n.toFixed(2))

/** One `[[deadline]]` block, keys in the file's order, defaults left out. */
export function deadlineToml(d: Deadline): string {
  const lines = [
    "[[deadline]]",
    `id = ${q(d.id)}`,
    `title = ${q(d.title)}`,
    `area = ${q(d.area)}`,
    `severity = ${q(d.severity)}`,
  ]
  lines.push(`date = ${d.date ?? q("TODO")}`)
  if (d.repeat && d.repeat !== "none") lines.push(`repeat = ${q(d.repeat)}`)
  if (d.until) lines.push(`until = ${d.until}`)
  if (d.remind_days.length)
    lines.push(`remind_days = [${d.remind_days.join(", ")}]`)
  if (d.amount !== null) lines.push(`amount = ${num(d.amount)}`)
  else if (d.payment && !Object.keys(d.amounts).length)
    lines.push(`amount = ${q("TODO")}`)
  const amounts = Object.entries(d.amounts)
  if (amounts.length)
    lines.push(
      `amounts = { ${amounts.map(([k, v]) => `${q(k)} = ${num(v)}`).join(", ")} }`
    )
  if (d.sensitive) lines.push("sensitive = true")
  if (d.case) lines.push(`case = ${q(d.case)}`)
  if (d.notes) lines.push(`notes = ${q(d.notes)}`)
  if (d.source) lines.push(`source = ${q(d.source)}`)
  if (d.finance_category)
    lines.push(`finance_category = ${q(d.finance_category)}`)
  if (d.finance_recurring)
    lines.push(`finance_recurring = ${q(d.finance_recurring)}`)
  return lines.join("\n") + "\n"
}

function value(v: unknown): string {
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : q(v)
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  return q(String(v))
}

export function profileToml(p: Profile): string {
  const out: string[] = []
  for (const [section, v] of Object.entries(p)) {
    const rows = Array.isArray(v) ? v : [v]
    for (const row of rows) {
      out.push(Array.isArray(v) ? `[[${section}]]` : `[${section}]`)
      for (const [k, x] of Object.entries(row))
        if (x !== null) out.push(`${k} = ${value(x)}`)
      out.push("")
    }
  }
  return out.join("\n")
}

/** Unified diff hunks (`@@`, ` `, `-`, `+`) between two texts; "" when they are the same. */
export function unifiedDiff(a: string, b: string, context = 2): string {
  if (a === b) return ""
  const x = a ? a.split("\n") : []
  const y = b ? b.split("\n") : []
  // Longest common subsequence, then walk it into edits.
  const n = x.length
  const m = y.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  )
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] =
        x[i] === y[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const edits: { op: " " | "-" | "+"; line: string; ai: number; bi: number }[] =
    []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j])
      edits.push({ op: " ", line: x[i], ai: i++, bi: j++ })
    else if (j < m && (i >= n || lcs[i][j + 1] >= lcs[i + 1][j]))
      edits.push({ op: "+", line: y[j], ai: i, bi: j++ })
    else edits.push({ op: "-", line: x[i], ai: i++, bi: j })
  }
  // Group the changes with `context` lines around them.
  const keep = edits.map(
    (e, k) =>
      e.op !== " " ||
      edits
        .slice(Math.max(0, k - context), k + context + 1)
        .some((x) => x.op !== " ")
  )
  const hunks: string[] = []
  let k = 0
  while (k < edits.length) {
    if (!keep[k]) {
      k++
      continue
    }
    const startK = k
    while (k < edits.length && keep[k]) k++
    const part = edits.slice(startK, k)
    const aCount = part.filter((e) => e.op !== "+").length
    const bCount = part.filter((e) => e.op !== "-").length
    hunks.push(
      `@@ -${part[0].ai + 1},${aCount} +${part[0].bi + 1},${bCount} @@`,
      ...part.map((e) => `${e.op}${e.line}`)
    )
  }
  return hunks.join("\n")
}
