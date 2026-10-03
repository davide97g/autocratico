/** Data access for the API: the register, done state, chats. The server is the only writer of state.json and chats/. */
import { randomBytes } from "node:crypto"
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"

import { type Chat, type Data, today } from "@autocratico/core"
import { dataPaths, loadData, loadState } from "@autocratico/core/node"

import { locks, writeJson } from "./files.ts"

export class Store {
  readonly dir: string
  readonly timeZone: string
  readonly paths: ReturnType<typeof dataPaths>

  constructor(dir: string, timeZone: string) {
    this.dir = dir
    this.timeZone = timeZone
    this.paths = dataPaths(dir)
  }

  today(): string {
    return today(this.timeZone)
  }

  data(): Data {
    return loadData(this.dir, this.today())
  }

  /** Mark one occurrence (`<id>@<date>`) as done or not done; returns the done date. */
  setDone(key: string, done: boolean): Promise<string | null> {
    return locks.run(this.paths.state, () => {
      const state = loadState(this.dir)
      if (done) state.done[key] = this.today()
      else delete state.done[key]
      const sorted = Object.fromEntries(Object.entries(state.done).sort(([a], [b]) => (a < b ? -1 : 1)))
      writeJson(this.paths.state, { ...state, done: sorted })
      return state.done[key] ?? null
    })
  }

  // ---------- chats ----------

  chats(channel?: Chat["channel"]): Chat[] {
    const dir = this.paths.chats
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .flatMap((f) => {
        try {
          return [JSON.parse(readFileSync(join(dir, f), "utf8")) as Chat]
        } catch {
          return []
        }
      })
      .filter((c) => !channel || c.channel === channel)
      .sort((a, b) => (a.updated < b.updated ? 1 : -1))
  }

  chat(id: string): Chat | null {
    if (!/^[\w-]{1,64}$/.test(id)) return null
    const file = join(this.paths.chats, `${id}.json`)
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Chat) : null
  }

  newChat(channel: Chat["channel"], id = randomBytes(8).toString("hex")): Chat {
    return { id, session: null, channel, updated: new Date().toISOString(), messages: [] }
  }

  saveChat(chat: Chat): Promise<void> {
    return locks.run(`chat:${chat.id}`, () =>
      writeJson(join(this.paths.chats, `${chat.id}.json`), { ...chat, updated: new Date().toISOString() })
    )
  }

  deleteChat(id: string): boolean {
    if (!/^[\w-]{1,64}$/.test(id)) return false
    const file = join(this.paths.chats, `${id}.json`)
    if (!existsSync(file)) return false
    rmSync(file)
    return true
  }
}
