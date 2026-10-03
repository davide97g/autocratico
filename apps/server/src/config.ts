/** Server settings, all from environment variables (see docs/deploy-homelab.md). */
import { existsSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { resolve } from "node:path"

export const ROOT = resolve(import.meta.dirname, "../../..")

export type Config = {
  root: string
  data: string
  web: string
  host: string
  port: number
  /** dev: loopback only, no login. prod: Cloudflare Access + paired devices. */
  auth: "dev" | "prod"
  /** Public address of the web app, e.g. https://autocratico.example.com (prod). */
  publicOrigin: string | null
  access: { team: string; aud: string } | null
  timeZone: string
  locale: "it" | "en"
  telegramToken: string | null
  backups: string | null
  /** Scheduled jobs (sync, triage, reminders, backup). */
  jobs: boolean
  claude: string | null
  python: string
  /** Local speech to text (parakeet-cli + model + ffmpeg); null when any piece is missing. */
  asr: { bin: string; model: string; threads: number } | null
}

function env(name: string): string | undefined {
  const v = process.env[name]?.trim()
  return v ? v : undefined
}

function onPath(name: string): string | null {
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (dir && existsSync(resolve(dir, name))) return resolve(dir, name)
  }
  return null
}

function findClaude(): string | null {
  const explicit = env("CLAUDE_BIN")
  if (explicit) return explicit
  const local = resolve(homedir(), ".local/bin/claude")
  return onPath("claude") ?? (existsSync(local) ? local : null)
}

/** ASR_BIN / ASR_MODEL, else /asr (the container's mount: parakeet-cli and a ggml .bin model), else PATH. */
function findAsr(): Config["asr"] {
  const dir = env("ASR_DIR") ?? "/asr"
  const inDir = (f: (name: string) => boolean) => {
    try {
      const name = readdirSync(dir).find(f)
      return name ? resolve(dir, name) : null
    } catch {
      return null
    }
  }
  const bin = env("ASR_BIN") ?? inDir((n) => n === "parakeet-cli") ?? onPath("parakeet-cli")
  const model = env("ASR_MODEL") ?? inDir((n) => n.endsWith(".bin"))
  if (!bin || !model || !existsSync(model) || !onPath("ffmpeg")) return null
  return { bin, model, threads: Number(env("ASR_THREADS") ?? 4) }
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const auth = env("AUTOCRATICO_AUTH") === "prod" ? "prod" : "dev"
  const team = env("CF_ACCESS_TEAM")
  const aud = env("CF_ACCESS_AUD")
  const config: Config = {
    root: ROOT,
    data: resolve(env("AUTOCRATICO_DATA")?.replace(/^~/, homedir()) ?? resolve(ROOT, "data")),
    web: resolve(ROOT, "apps/web/dist"),
    host: env("HOST") ?? "127.0.0.1",
    port: Number(env("PORT") ?? 8790),
    auth,
    publicOrigin: env("PUBLIC_ORIGIN")?.replace(/\/+$/, "") ?? null,
    access: team && aud ? { team, aud } : null,
    timeZone: env("TZ_DEADLINES") ?? "Europe/Rome",
    locale: env("AUTOCRATICO_LOCALE") === "en" ? "en" : "it",
    telegramToken: env("TELEGRAM_BOT_TOKEN") ?? null,
    backups: env("BACKUP_DIR") ?? null,
    // Scheduled jobs run by default on the always-on server only; locally, opt in with AUTOCRATICO_JOBS=on.
    jobs: auth === "prod" ? env("AUTOCRATICO_JOBS") !== "off" : env("AUTOCRATICO_JOBS") === "on",
    claude: findClaude(),
    python: env("PYTHON") ?? "python3",
    asr: findAsr(),
    ...overrides,
  }
  validate(config)
  return config
}

/** Fail closed: a production server without its protections must not start. */
function validate(c: Config) {
  if (c.auth === "dev") {
    if (!["127.0.0.1", "localhost", "::1"].includes(c.host)) {
      throw new Error(`AUTOCRATICO_AUTH=dev only listens on loopback (HOST=${c.host}): set AUTOCRATICO_AUTH=prod`)
    }
    return
  }
  if (!c.publicOrigin) throw new Error("AUTOCRATICO_AUTH=prod needs PUBLIC_ORIGIN (e.g. https://autocratico.example.com)")
  if (!c.access && env("CF_ACCESS") !== "off") {
    throw new Error(
      "AUTOCRATICO_AUTH=prod needs CF_ACCESS_TEAM and CF_ACCESS_AUD (Cloudflare Access), or CF_ACCESS=off to rely on paired devices only"
    )
  }
}
