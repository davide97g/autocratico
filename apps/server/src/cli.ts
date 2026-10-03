/**
 * Admin commands, run on the server machine (or `docker exec` in the container):
 *   node apps/server/src/cli.ts pair [--name NAME]            one-time code to pair a browser
 *   node apps/server/src/cli.ts token --name NAME             token for an iOS/macOS shortcut (ingest only)
 *   node apps/server/src/cli.ts devices                       list paired devices
 *   node apps/server/src/cli.ts revoke ID                     revoke a device
 *   node apps/server/src/cli.ts telegram                      one-time code to pair a Telegram chat (/start CODE)
 *   node apps/server/src/cli.ts job NAME                      run a job now (gmail, triage, reminders, digest, backup)
 */
import { parseArgs } from "node:util"

import { Devices } from "./auth.ts"
import { loadConfig } from "./config.ts"
import { JOB_NAMES, type JobName } from "./jobs.ts"
import { services } from "./services.ts"

const { positionals, values } = parseArgs({ allowPositionals: true, options: { name: { type: "string" } } })
const [command, arg] = positionals
const config = loadConfig({ jobs: false })
const devices = new Devices(config.data)

switch (command) {
  case "pair": {
    const code = await devices.startPairing(values.name ?? "browser", "full")
    console.log(`Pairing code: ${code} (valid 10 minutes)\nOpen ${config.publicOrigin ?? "the web app"} and enter it.`)
    break
  }
  case "token": {
    if (!values.name) throw new Error("--name is required")
    const { device, token } = await devices.create(values.name, "ingest")
    console.log(`Ingest token for "${device.name}" (shown once, store it in the shortcut):\n${token}`)
    break
  }
  case "devices":
    for (const d of devices.list()) console.log(`${d.id}  ${d.scope.padEnd(6)}  ${d.name}  last seen ${d.last_seen ?? "never"}`)
    break
  case "revoke":
    console.log((await devices.revoke(arg ?? "")) ? "Revoked." : "No such device.")
    break
  case "telegram": {
    const s = services(config)
    if (!s.telegram) throw new Error("TELEGRAM_BOT_TOKEN is not set")
    const code = await s.telegram.startPairing()
    console.log(`Send this to your bot within 10 minutes:\n/start ${code}`)
    break
  }
  case "job": {
    if (!JOB_NAMES.includes(arg as JobName)) throw new Error(`job: one of ${JOB_NAMES.join(", ")}`)
    const s = services(config)
    const run = await s.jobs!.trigger(arg as JobName)
    console.log(`${run.ok ? "ok" : "failed"}: ${run.summary}`)
    break
  }
  default: {
    const { readFileSync } = await import("node:fs")
    const doc = readFileSync(new URL(import.meta.url), "utf8").match(/\/\*\*([\s\S]*?)\*\//)?.[1] ?? ""
    console.log(doc.replace(/^\s*\* ?/gm, "").trim())
    process.exitCode = 2
  }
}
