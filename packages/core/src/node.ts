/** Reading the data folder from disk (Node only). Mirrors the loaders in scripts/store.py. */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { agenda, incomplete, jsonable, parseDeadlines, parseToml } from "./deadlines.ts"
import { parseCase, parseCatalogEntry } from "./documents.ts"
import type { Case, CatalogEntry, Data, Deadline, Profile, State } from "./schema.ts"

export function dataPaths(dir: string) {
  return {
    dir,
    deadlines: join(dir, "deadlines.toml"),
    profile: join(dir, "profile.toml"),
    state: join(dir, "state.json"),
    cases: join(dir, "cases"),
    catalog: join(dir, "catalog"),
    inbox: join(dir, "inbox"),
    chats: join(dir, "chats"),
    jobs: join(dir, "jobs"),
    notes: join(dir, "notes"),
    archive: join(dir, "archive"),
    out: join(dir, "out"),
    secrets: join(dir, "secrets"),
  }
}

export function loadDeadlines(dir: string): Deadline[] {
  const file = dataPaths(dir).deadlines
  if (!existsSync(file)) throw new Error(`${file} is missing: run \`python3 scripts/init.py\` to create the data folder`)
  return parseDeadlines(readFileSync(file, "utf8"))
}

export function loadState(dir: string): State {
  const file = dataPaths(dir).state
  if (!existsSync(file)) return { done: {} }
  const state = JSON.parse(readFileSync(file, "utf8")) as State
  return { ...state, done: state.done ?? {} }
}

export function loadProfile(dir: string): Profile {
  const file = dataPaths(dir).profile
  if (!existsSync(file)) return {}
  return jsonable(parseToml(readFileSync(file, "utf8"), "profile.toml")) as Profile
}

export function loadCases(dir: string): Case[] {
  const root = dataPaths(dir).cases
  if (!existsSync(root)) return []
  return readdirSync(root)
    .filter((slug) => existsSync(join(root, slug, "README.md")))
    .sort()
    .reverse()
    .map((slug) => parseCase(slug, readFileSync(join(root, slug, "README.md"), "utf8")))
}

export function loadCatalog(dir: string): CatalogEntry[] {
  const root = dataPaths(dir).catalog
  if (!existsSync(root)) return []
  return readdirSync(root)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => parseCatalogEntry(f.slice(0, -3), readFileSync(join(root, f), "utf8")))
}

/** Everything the web app shows, in one object (`GET /api/data`). */
export function loadData(dir: string, today: string): Data {
  const deadlines = loadDeadlines(dir)
  return {
    today,
    agenda: agenda(deadlines, loadState(dir), today),
    incomplete: incomplete(deadlines),
    cases: loadCases(dir),
    profile: loadProfile(dir),
    catalog: loadCatalog(dir),
  }
}
