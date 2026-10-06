/** Wires the server's parts together; shared by main.ts and the tests. */
import { Account } from "./account.ts"
import { createApp, type Services } from "./app.ts"
import { Devices } from "./auth.ts"
import { Changes } from "./changes.ts"
import { Claude } from "./claude.ts"
import type { Config } from "./config.ts"
import { Finance } from "./finance.ts"
import { GmailLinks, gmailScript } from "./gmail-links.ts"
import { DataRepo } from "./git.ts"
import { Inbox } from "./inbox.ts"
import { Reminders } from "./reminders.ts"
import { Jobs } from "./jobs.ts"
import { Pulse } from "./pulse.ts"
import { Store } from "./store.ts"
import { Telegram } from "./telegram.ts"
import { Transcriber } from "./transcribe.ts"
import { Usage } from "./usage.ts"

export function services(config: Config, overrides: Partial<Services> = {}): Services {
  const store = new Store(config.data, config.timeZone)
  const inbox = new Inbox(config.data)
  const usage = new Usage(config.data)
  const claude = new Claude(config, usage)
  const repo = new DataRepo(config.data)
  const reminders = new Reminders(config.data, config.timeZone)
  const finance = overrides.finance ?? new Finance(config.data, { timeZone: config.timeZone })
  const pulse = new Pulse()
  const s: Services = {
    config,
    store,
    inbox,
    devices: new Devices(config.data),
    account: overrides.account ?? new Account(config),
    changes: new Changes(store, repo),
    claude,
    repo,
    jobs: null,
    telegram: null,
    transcriber: new Transcriber(config),
    reminders,
    finance,
    pulse,
    usage,
    gmailLinks: new GmailLinks(config.data, gmailScript(config)),
    ...overrides,
  }
  if (config.telegramToken && overrides.telegram === undefined) {
    s.telegram = new Telegram(config.telegramToken, { config, store, inbox, claude, reminders, transcriber: s.transcriber, changes: s.changes, gmailLinks: s.gmailLinks, jobs: () => s.jobs })
  }
  if (overrides.jobs === undefined) {
    s.jobs = new Jobs({ config, store, inbox, claude, repo, reminders, finance, pulse: s.pulse, notifier: () => s.telegram })
  }
  return s
}

export { createApp }
