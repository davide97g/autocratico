/**
 * Photos and previews, decoded on this machine only.
 *
 * iPhone photos arrive as HEIC, which neither Claude Code nor most browsers can show: each one is
 * replaced by a JPEG (libheif's `heif-dec`, or `sips` on macOS). Quality 85 at full resolution:
 * about the size of the HEIC, text stays sharp (PNG is ~6x larger, WebP is no smaller at the same
 * quality). The HEIC is deleted only once the JPEG is written.
 *
 * Previews for the web app are small JPEGs made with ffmpeg, cached under out/thumbs/.
 */
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, statSync } from "node:fs"
import { mkdtemp, readdir, rename, rm } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"

import { fileName } from "@autocratico/core"

import { locks } from "./files.ts"

const exec = promisify(execFile)
const QUALITY = "85"
const TIMEOUT_MS = 120_000
const THUMB_WIDTH = 480

export const HEIC = /\.(heic|heif)$/i
/** Raster images a browser shows safely inline; anything else is served as a download. */
export const IMAGE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
}

const stem = (name: string) => name.replace(HEIC, "")

/** JPEGs already made from `heic` (`<stem>.jpg`, or `<stem>-N.jpg` for a file with several images). */
export function copiesOf(heic: string, files: readonly string[]): string[] {
  const s = stem(heic).toLowerCase()
  return files.filter((g) => g.toLowerCase().startsWith(s) && /^(-\d+)?\.jpg$/.test(g.toLowerCase().slice(s.length)))
}

async function decode(input: string, output: string) {
  try {
    await exec("heif-dec", ["--quiet", "-q", QUALITY, input, output], { timeout: TIMEOUT_MS })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT" || process.platform !== "darwin") throw e
    await exec("sips", ["-s", "format", "jpeg", "-s", "formatOptions", QUALITY, input, "--out", output], { timeout: TIMEOUT_MS })
  }
}

/** Decodes `dir/<name>.heic` into `<name>.jpg` (`-1`, `-2`... for several images) and returns the new names. */
async function heicToJpeg(dir: string, name: string, taken: readonly string[]): Promise<string[]> {
  // Inside the folder, so the result is a rename on the same filesystem.
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

/**
 * Replaces every HEIC in `dir` (among `files`) with its JPEG and returns the new list, in the
 * same order. A HEIC that fails to decode stays as it is.
 */
export async function replaceHeic(dir: string, files: readonly string[]): Promise<string[]> {
  let out = [...files]
  for (const name of files.filter((f) => HEIC.test(f))) {
    try {
      let jpegs = copiesOf(name, out)
      if (!jpegs.length) jpegs = await heicToJpeg(dir, name, out)
      if (!jpegs.length) throw new Error("no image decoded")
      await rm(join(dir, name), { force: true })
      const at = out.indexOf(name)
      out = [...out.slice(0, at), ...jpegs, ...out.slice(at + 1).filter((f) => !jpegs.includes(f))]
    } catch (e) {
      console.error(`images: cannot convert ${join(dir, name)}: ${e instanceof Error ? e.message : e}`)
    }
  }
  return out
}

/** A small JPEG preview of an image, made once and cached; null when ffmpeg cannot make one. */
export function thumbnail(data: string, file: string): Promise<string | null> {
  const { mtimeMs, size } = statSync(file)
  const key = createHash("sha256").update(`${file}\0${mtimeMs}\0${size}`).digest("hex").slice(0, 32)
  const dir = join(data, "out", "thumbs")
  const out = join(dir, `${key}.jpg`)
  if (existsSync(out)) return Promise.resolve(out)
  return locks.run("thumbs", async () => {
    if (existsSync(out)) return out
    mkdirSync(dir, { recursive: true })
    try {
      const tmp = `${out}.tmp.jpg`
      await exec("ffmpeg", ["-nostdin", "-loglevel", "error", "-y", "-i", file, "-frames:v", "1", "-vf", `scale='min(${THUMB_WIDTH},iw)':-2`, "-q:v", "5", tmp], {
        timeout: 30_000,
      })
      await rename(tmp, out)
      return out
    } catch {
      return null
    }
  })
}
