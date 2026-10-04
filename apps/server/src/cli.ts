/**
 * Admin commands, run on the server machine (or `docker exec` in the container):
 *   node apps/server/src/cli.ts setup-code                    one-time code for the first setup (prod)
 *   node apps/server/src/cli.ts reset-password                set a new masterpass, log every browser out
 *   node apps/server/src/cli.ts token --name NAME             token for an iOS/macOS shortcut (ingest only)
 *   node apps/server/src/cli.ts devices                       list shortcut tokens
 *   node apps/server/src/cli.ts revoke ID                     revoke a shortcut token
 *   node apps/server/src/cli.ts telegram                      one-time code to pair a Telegram chat (/start CODE)
 *   node apps/server/src/cli.ts job NAME                      run a job now (gmail, triage, reminders, digest, backup)
 *   node apps/server/src/cli.ts gmail-client FILE             install the OAuth client JSON from Google Cloud (as Settings does)
 */
import { readFileSync } from "node:fs"
import { parseArgs } from "node:util"

import { Account } from "./account.ts"
import { Devices } from "./auth.ts"
import { loadConfig } from "./config.ts"
import { Gmail } from "./gmail.ts"
import { JOB_NAMES, type JobName } from "./jobs.ts"
import { services } from "./services.ts"

const { positionals, values } = parseArgs({ allowPositionals: true, options: { name: { type: "string" } } })
const [command, arg] = positionals
const config = loadConfig({ jobs: false })
const devices = new Devices(config.data)

switch (command) {
  case "gmail-client": {
    if (!arg) throw new Error("usage: gmail-client FILE")
    const client = new Gmail(config.data).saveClient(JSON.parse(readFileSync(arg, "utf8")))
    console.log(`OAuth client saved (${client?.type}, ${client?.clientId}). Redirect URIs: ${client?.redirects.join(", ") || "none"}`)
    break
  }
  case "setup-code": {
    const account = new Account(config)
    if (await account.owner()) throw new Error("already set up: use reset-password for a forgotten masterpass")
    const code = await account.startSetupCode()
    console.log(`Setup code: ${code} (valid 10 minutes)\nOpen ${config.publicOrigin ?? "the web app"} and enter it with your masterpass.`)
    break
  }
  case "reset-password": {
    const account = new Account(config)
    const password = await readPassword("New masterpass: ")
    if (process.stdin.isTTY && (await readPassword("Again: ")) !== password) throw new Error("the two passwords differ")
    await account.resetPassword(password)
    console.log("Masterpass changed. Every browser has been logged out.")
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
    const run = await s.jobs!.trigger(arg as JobName, true)
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

/** A line from the terminal without echo, or from stdin when piped. */
async function readPassword(prompt: string): Promise<string> {
  const { stdin, stdout } = process
  if (!stdin.isTTY) {
    let text = ""
    for await (const chunk of stdin) text += chunk
    return text.split("\n")[0]
  }
  stdout.write(prompt)
  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding("utf8")
  return new Promise((resolve, reject) => {
    let value = ""
    const done = (fn: () => void) => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.off("data", onData)
      stdout.write("\n")
      fn()
    }
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return done(() => resolve(value))
        if (ch === "\u0003") return done(() => reject(new Error("cancelled")))
        if (ch === "\u007f") value = value.slice(0, -1)
        else value += ch
      }
    }
    stdin.on("data", onData)
  })
}
