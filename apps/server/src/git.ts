/**
 * The data folder is its own local git repository (never pushed anywhere): every agent run and
 * a daily snapshot become commits, so changes can be reviewed in the Activity view and undone.
 * Only the hand-edited text files are tracked; archive, inbox, secrets and outputs are not.
 */
import { execFile } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { promisify } from "node:util"

import type { Commit } from "@autocratico/core"

const run = promisify(execFile)

const IGNORE = `# Managed by autocratico: only the register is versioned.
/*
!/.gitignore
!/deadlines.toml
!/profile.toml
!/state.json
!/gmail.toml
!/cases/
!/catalog/
!/notes/
`

export class DataRepo {
  readonly dir: string

  constructor(dir: string) {
    this.dir = dir
  }

  async #git(...args: string[]): Promise<string> {
    const { stdout } = await run(
      "git",
      ["-C", this.dir, "-c", `safe.directory=${this.dir}`, "-c", "user.name=autocratico", "-c", "user.email=autocratico@localhost", "-c", "commit.gpgsign=false", ...args],
      { maxBuffer: 8 * 1024 * 1024 }
    )
    return stdout
  }

  async available(): Promise<boolean> {
    try {
      await run("git", ["--version"])
      return true
    } catch {
      return false
    }
  }

  async init(): Promise<void> {
    if (!(await this.available())) return
    if (!existsSync(join(this.dir, ".gitignore"))) writeFileSync(join(this.dir, ".gitignore"), IGNORE)
    if (!existsSync(join(this.dir, ".git"))) {
      await this.#git("init", "-q", "-b", "main")
      await this.commit("Start tracking the register")
    }
  }

  /** Commit everything tracked that changed; returns the hash, or null when nothing changed. */
  async commit(message: string): Promise<string | null> {
    if (!existsSync(join(this.dir, ".git"))) return null
    await this.#git("add", "-A")
    const status = await this.#git("status", "--porcelain")
    if (!status.trim()) return null
    await this.#git("commit", "-q", "-m", message)
    return (await this.#git("rev-parse", "--short", "HEAD")).trim()
  }

  /** Commit only `paths` (relative to the data folder), so unrelated edits stay out of an undoable change. */
  async commitPaths(message: string, paths: string[]): Promise<string | null> {
    if (!existsSync(join(this.dir, ".git")) || !paths.length) return null
    await this.#git("add", "--", ...paths)
    const status = await this.#git("status", "--porcelain", "--", ...paths)
    if (!status.trim()) return null
    await this.#git("commit", "-q", "-m", message, "--", ...paths)
    return (await this.#git("rev-parse", "--short", "HEAD")).trim()
  }

  async log(limit = 30): Promise<Commit[]> {
    if (!existsSync(join(this.dir, ".git"))) return []
    const out = await this.#git("log", `-n${limit}`, "--name-only", "--format=%x1e%h%x1f%aI%x1f%s")
    return out
      .split("\x1e")
      .filter((b) => b.trim())
      .map((block) => {
        const [head, ...files] = block.trim().split("\n")
        const [hash, date, subject] = head.split("\x1f")
        return { hash, date, subject, files: files.filter(Boolean) }
      })
  }

  async show(hash: string): Promise<string | null> {
    if (!/^[0-9a-f]{4,40}$/.test(hash) || !existsSync(join(this.dir, ".git"))) return null
    try {
      return (await this.#git("show", "--format=%h %aI%n%B", "--stat", "--patch", hash)).slice(0, 200_000)
    } catch {
      return null
    }
  }

  /** Undo one commit with a new commit (history stays). */
  async revert(hash: string): Promise<string | null> {
    if (!/^[0-9a-f]{4,40}$/.test(hash)) return null
    await this.#git("revert", "--no-edit", hash)
    return (await this.#git("rev-parse", "--short", "HEAD")).trim()
  }
}
