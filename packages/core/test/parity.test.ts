/** The TS loaders must agree with scripts/store.py, which the Python CLIs (upcoming, ics) keep using. */
import { execFileSync } from "node:child_process"
import { cpSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { loadData } from "../src/node.ts"

const ROOT = resolve(import.meta.dirname, "../../..")

function python(dir: string, today: string) {
  const out = execFileSync("python3", [join(ROOT, "scripts/store.py"), today], {
    env: { ...process.env, AUTOCRATICO_DATA: dir },
    encoding: "utf8",
  })
  return JSON.parse(out)
}

describe("parity with scripts/store.py", () => {
  for (const today of ["2026-10-03", "2027-01-31", "2028-02-29", "2026-12-31"]) {
    it(`example dataset on ${today}`, () => {
      expect(JSON.parse(JSON.stringify(loadData(join(ROOT, "example"), today)))).toEqual(python(join(ROOT, "example"), today))
    })
  }

  it("month-end recurrence and every N months", () => {
    const dir = mkdtempSync(join(tmpdir(), "autocratico-"))
    cpSync(join(ROOT, "example"), dir, { recursive: true })
    writeFileSync(
      join(dir, "deadlines.toml"),
      `[[deadline]]
id = "end"
title = "Month end"
area = "bank"
date = 2026-01-31
repeat = "monthly"

[[deadline]]
id = "leap"
title = "Leap"
area = "tax"
date = 2024-02-29
repeat = "yearly"
severity = "low"

[[deadline]]
id = "q"
title = "Quarterly"
area = "tax"
date = 2026-03-31
repeat = "every 3 months"
amount = 12.5

[[deadline]]
id = "todo"
title = "Unknown"
area = "home"
date = "TODO"

[[deadline]]
id = "ended"
title = "Ended"
area = "tax"
date = 2025-06-16
repeat = "yearly"
until = 2026-06-30

[[deadline]]
id = "bill"
title = "Bill"
area = "home"
date = 2025-11-20
repeat = "monthly"
amounts = { "2025-11-20" = 30.0, "2026-04-20" = 50, "2026-08-20" = 70.55, "2026-10-20" = 41.1 }

[[deadline]]
id = "insurance"
title = "Insurance"
area = "vehicles"
date = 2027-02-10
repeat = "yearly"
amount = "TODO"

[[deadline]]
id = "dropped"
title = "Dropped"
area = "home"
date = "TODO"
until = 2026-01-01

[[deadline]]
id = "redditi"
title = "Income tax return"
area = "tax"
date = 2025-10-31
repeat = "yearly"
shift = "tax"

[[deadline]]
id = "f24"
title = "Monthly F24"
area = "tax"
date = 2026-06-16
repeat = "monthly"
shift = "tax"

[[deadline]]
id = "christmas"
title = "On Christmas"
area = "home"
date = 2026-12-25
shift = "workday"

[[deadline]]
id = "easter"
title = "Easter Monday"
area = "home"
date = 2027-03-29
repeat = "yearly"
shift = "workday"
`
    )
    expect(JSON.parse(JSON.stringify(loadData(dir, "2026-10-03")))).toEqual(python(dir, "2026-10-03"))
  })
})
