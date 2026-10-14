// The custom widgets' sandbox page (public/sandbox/widget.html): its CSP runs only its own script, by
// hash, so the hash must follow every edit of that script; the copies of the CSP must agree.
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { SANDBOX_CSP } from "@autocratico/core"
import { describe, expect, it } from "vitest"

const ROOT = resolve(import.meta.dirname, "../../..")
const page = readFileSync(resolve(ROOT, "apps/web/public/sandbox/widget.html"), "utf8")

describe("sandbox page", () => {
  it("allows exactly its own script", () => {
    const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    expect(scripts).toHaveLength(1)
    const hash = createHash("sha256").update(scripts[0][1]).digest("base64")
    expect(SANDBOX_CSP).toContain(`script-src 'sha256-${hash}';`)
    expect(SANDBOX_CSP).not.toMatch(/unsafe-inline'[^;]*;?\s*(?=.*script)|script-src[^;]*(?:'unsafe|'self'|https?:)/)
  })

  it("repeats the same CSP in its meta and in the demo's nginx", () => {
    const meta = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(page)![1]
    expect(`${meta}; frame-ancestors 'self'`).toBe(SANDBOX_CSP)
    expect(readFileSync(resolve(ROOT, "deploy/demo.nginx.conf"), "utf8")).toContain(`Content-Security-Policy "${SANDBOX_CSP}"`)
  })

  it("blocks every connection and load", () => {
    for (const d of ["default-src 'none'", "connect-src 'none'", "frame-src 'none'", "object-src 'none'", "form-action 'none'", "base-uri 'none'", "worker-src blob:", "img-src data:"]) expect(SANDBOX_CSP).toContain(d)
  })
})
