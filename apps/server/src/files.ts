/** Small file helpers: atomic writes, private files, a lock for read-modify-write cycles. */
import { randomBytes } from "node:crypto"
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

export function writeAtomic(file: string, content: string | Uint8Array, mode?: number) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`
  writeFileSync(tmp, content, mode === undefined ? undefined : { mode })
  renameSync(tmp, file)
}

export function readJson<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback
  return JSON.parse(readFileSync(file, "utf8")) as T
}

export function writeJson(file: string, value: unknown, mode?: number) {
  writeAtomic(file, JSON.stringify(value, null, 2) + "\n", mode)
}

/** Files in data/secrets: folder 0700, files 0600. */
export function writeSecret(file: string, value: unknown) {
  const dir = dirname(file)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  chmodSync(dir, 0o700)
  writeJson(file, value, 0o600)
}

/** Serialises async sections per key (state.json, devices, inbox items) inside this process. */
export class Locks {
  #tails = new Map<string, Promise<unknown>>()

  run<T>(key: string, fn: () => T | Promise<T>): Promise<T> {
    const before = this.#tails.get(key) ?? Promise.resolve()
    const next = before.then(fn, fn)
    const tail = next.catch(() => undefined)
    this.#tails.set(key, tail)
    void tail.then(() => {
      if (this.#tails.get(key) === tail) this.#tails.delete(key)
    })
    return next
  }
}

export const locks = new Locks()
