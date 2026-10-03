/**
 * iPhone photos arrive as HEIC, which Claude Code cannot look at: they get a JPEG copy before
 * triage. Decoding happens on this machine (libheif's `heif-dec`, or `sips` on macOS).
 */
import { execFile } from "node:child_process"
import { mkdtemp, readdir, rename, rm } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"

import { fileName } from "@autocratico/core"

const exec = promisify(execFile)
const QUALITY = "85"
const TIMEOUT_MS = 120_000

export const HEIC = /\.(heic|heif)$/i

const stem = (name: string) => name.replace(HEIC, "")

/** HEIC files of an item that have no JPEG copy yet. */
export function needsCopy(files: readonly string[]): string[] {
  const copy = (heic: string, g: string) => {
    const s = stem(heic).toLowerCase()
    const l = g.toLowerCase()
    return l.startsWith(s) && /^(-\d+)?\.jpg$/.test(l.slice(s.length))
  }
  return files.filter((f) => HEIC.test(f) && !files.some((g) => copy(f, g)))
}

async function decode(input: string, output: string) {
  try {
    await exec("heif-dec", ["--quiet", "-q", QUALITY, input, output], { timeout: TIMEOUT_MS })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT" || process.platform !== "darwin") throw e
    await exec("sips", ["-s", "format", "jpeg", "-s", "formatOptions", QUALITY, input, "--out", output], { timeout: TIMEOUT_MS })
  }
}

/**
 * Writes `<name>.jpg` next to `dir/<name>.heic` (`<name>-1.jpg`, `-2`... when the file holds
 * several images) and returns the new names.
 */
export async function heicToJpeg(dir: string, name: string, taken: readonly string[]): Promise<string[]> {
  // Inside the item folder, so the result is a rename on the same filesystem.
  const tmp = await mkdtemp(join(dir, ".convert-"))
  try {
    await decode(join(dir, name), join(tmp, `${stem(name)}.jpg`))
    const names = [...taken]
    for (const out of (await readdir(tmp)).filter((f) => f.endsWith(".jpg")).sort()) {
      const n = fileName(out, names)
      await rename(join(tmp, out), join(dir, n))
      names.push(n)
    }
    return names.slice(taken.length)
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}
