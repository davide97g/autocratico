/** Autocratico server: API, web app, scheduled jobs, Telegram bot. Settings: see config.ts. */
import { execFileSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { serve } from "@hono/node-server"

import { createApp } from "./app.ts"
import { loadConfig } from "./config.ts"
import { services } from "./services.ts"

const config = loadConfig()
if (!existsSync(config.data) || readdirSync(config.data).length === 0) {
  // First start: an empty register, filled in by the onboarding.
  execFileSync(config.python, [join(config.root, "scripts/init.py")], { stdio: "inherit", env: { ...process.env, AUTOCRATICO_DATA: config.data } })
}

const s = services(config)
await s.account.ready
await s.devices.prune()
await s.inbox.recover()
// Photos that arrived as HEIC before the server converted them.
void s.inbox.convertAll().catch((e: Error) => console.error(`inbox: ${e.message}`))
await s.repo.init().catch((e: Error) => console.error(`git: ${e.message}`))

const server = serve({ fetch: createApp(s).fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(`autocratico on http://${info.address}:${info.port} (auth: ${config.auth}, data: ${config.data})`)
  if (!config.claude) console.log("claude not found: chat and agent jobs are off")
})

if (!(await s.account.owner())) {
  const url = config.publicOrigin ?? `http://${config.host}:${config.port}`
  if (config.auth === "prod") {
    const code = await s.account.startSetupCode()
    console.log(`Not set up yet: open ${url} and enter the setup code ${code} (valid 10 minutes; new one: cli.ts setup-code)`)
  } else {
    console.log(`Not set up yet: open ${url} to choose your masterpass`)
  }
}

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
