/** Wires the server's parts together; shared by main.ts and the tests. */
import { createApp, type Services } from "./app.ts"
import { Devices } from "./auth.ts"
import { Claude } from "./claude.ts"
import type { Config } from "./config.ts"
import { DataRepo } from "./git.ts"
import { Inbox } from "./inbox.ts"
import { Jobs } from "./jobs.ts"
import { Store } from "./store.ts"
import { Telegram } from "./telegram.ts"

export function services(config: Config, overrides: Partial<Services> = {}): Services {
  const store = new Store(config.data, config.timeZone)
  const inbox = new Inbox(config.data)
  const claude = new Claude(config)
  const repo = new DataRepo(config.data)
  const s: Services = {
    config,
    store,
    inbox,
    devices: new Devices(config.data),
    claude,
    repo,
    jobs: null,
    telegram: null,
    ...overrides,
  }
  if (config.telegramToken && overrides.telegram === undefined) {
    s.telegram = new Telegram(config.telegramToken, { config, store, inbox, claude, jobs: () => s.jobs })
  }
  if (overrides.jobs === undefined) {
    s.jobs = new Jobs({ config, store, inbox, claude, repo, notifier: () => s.telegram })
  }
  return s
}

export { createApp }
