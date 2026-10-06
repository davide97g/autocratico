// Waitlist API. Env: DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGDATABASE,
// TYPESAFE_API_KEY (optional: without it addresses are checked for syntax and DNS only),
// WAITLIST_ORIGINS (comma-separated origins of the landing page), HOST, PORT.
import { serve } from "@hono/node-server"

import { createApp } from "./app.ts"
import { pgStore } from "./db.ts"
import { jevJudge } from "./jev.ts"

const origins = (process.env.WAITLIST_ORIGINS ?? "https://autocratico.it,https://www.autocratico.it,http://localhost:5190")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean)
const key = process.env.TYPESAFE_API_KEY
if (!key) console.warn("[waitlist] TYPESAFE_API_KEY is not set: addresses are checked for syntax and DNS only")

const store = await pgStore(process.env.DATABASE_URL)
const app = createApp({ store, judge: key ? jevJudge(key) : null, origins })
const server = serve({ fetch: app.fetch, hostname: process.env.HOST ?? "127.0.0.1", port: Number(process.env.PORT ?? 8792) }, (info) =>
  console.info(`[waitlist] listening on ${info.address}:${info.port}, origins ${origins.join(" ")}`),
)

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close()
    void store.close().then(() => process.exit(0))
  })
}
