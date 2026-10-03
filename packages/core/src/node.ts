/** Reading the data folder from disk (Node only). Mirrors the loaders in scripts/store.py. */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import { agenda, incomplete, jsonable, parseDeadlines, parseToml } from "./deadlines.ts"
import { documentRefs, isDocumentFile, parseCase, parseCatalogEntry } from "./documents.ts"
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
    .map((slug) => {
      const c = parseCase(slug, readFileSync(join(root, slug, "README.md"), "utf8"))
      return { ...c, documents: listDocuments(dir, documentRefs(c.md)) }
    })
}

/** Files behind document references: a file as is, a folder as the files it holds; missing ones are left out. */
export function listDocuments(dir: string, refs: readonly string[]): string[] {
  const out: string[] = []
  for (const ref of refs) {
    const path = ref.replace(/\/+$/, "")
    try {
      const stat = statSync(join(dir, path))
      if (stat.isFile()) out.push(path)
      else if (stat.isDirectory()) {
        for (const f of readdirSync(join(dir, path)).sort()) {
          if (isDocumentFile(f) && statSync(join(dir, path, f)).isFile()) out.push(`${path}/${f}`)
        }
      }
    } catch {
      // gone, or not readable: nothing to show
    }
  }
  return [...new Set(out)]
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
