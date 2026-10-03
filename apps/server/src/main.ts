/** Autocratico server: API, web app, scheduled jobs, Telegram bot. Settings: see config.ts. */
import { existsSync } from "node:fs"

import { serve } from "@hono/node-server"

import { createApp } from "./app.ts"
import { loadConfig } from "./config.ts"
import { services } from "./services.ts"

const config = loadConfig()
if (!existsSync(config.data)) {
  console.error(`${config.data} does not exist: run \`python3 scripts/init.py\` first`)
  process.exit(1)
}

const s = services(config)
await s.inbox.recover()
await s.repo.init().catch((e: Error) => console.error(`git: ${e.message}`))

const server = serve({ fetch: createApp(s).fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(`autocratico on http://${info.address}:${info.port} (auth: ${config.auth}, data: ${config.data})`)
  if (!config.claude) console.log("claude not found: chat and agent jobs are off")
})

if (config.jobs) s.jobs?.start()
s.telegram?.start()

async function shutdown() {
  s.jobs?.stop()
  await s.telegram?.stop().catch(() => undefined)
  server.close()
  process.exit(0)
}
process.once("SIGINT", shutdown)
process.once("SIGTERM", shutdown)
