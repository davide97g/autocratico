/**
 * Photos and previews, decoded on this machine only.
 *
 * iPhone photos arrive as HEIC, which neither Claude Code nor most browsers can show: each one is
 * replaced by a JPEG (libheif's `heif-dec`, or `sips` on macOS). Quality 85 at full resolution:
 * about the size of the HEIC, text stays sharp (PNG is ~6x larger, WebP is no smaller at the same
 * quality). The HEIC is deleted only once its JPEG is written.
 *
 * Scans and faxes arrive as TIFF, which Claude Code cannot read either: each one gets a PDF with all
 * its pages next to it, and the TIFF stays. scripts/scans.py makes it (tiff2pdf, decoding every page)
 * and keeps it only when every page, rendered, matches the scan; otherwise the TIFF stays alone.
 * scripts/gmail.py and imap.py do the same for the emails they save.
 *
 * Previews for the web app are small JPEGs made with ffmpeg, cached under out/thumbs/.
 */
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, statSync } from "node:fs"
import { mkdtemp, readdir, rename, rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { fileName } from "@autocratico/core"

import { locks } from "./files.ts"

const exec = promisify(execFile)
const QUALITY = "85"
const TIMEOUT_MS = 120_000
const THUMB_WIDTH = 480
const SCANS = fileURLToPath(new URL("../../../scripts/scans.py", import.meta.url))

const TIFF = /\.(tiff?)$/i
/** Files the agent cannot read, given on arrival a copy it can (HEIC: JPEG, replacing it; TIFF: PDF, beside it). */
export const UNREADABLE = /\.(heic|heif|tiff?)$/i
/** Raster images a browser shows safely inline; anything else is served as a download. */
export const IMAGE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
}

const stem = (name: string) => name.replace(UNREADABLE, "")
const copyType = (name: string) => (TIFF.test(name) ? "pdf" : "jpg")
/** The name of the copy made from `name` (`scan.tif` → `scan.pdf`, `IMG_1.HEIC` → `IMG_1.jpg`). */
export const copyName = (name: string) => `${stem(name)}.${copyType(name)}`

/** Copies already made from `name` (`<stem>.jpg`, or `<stem>-N.jpg` for a HEIC with several images; `<stem>.pdf` for a TIFF). */
export function copiesOf(name: string, files: readonly string[]): string[] {
  const s = stem(name).toLowerCase()
  const copy = TIFF.test(name) ? /^\.pdf$/ : /^(-\d+)?\.jpg$/
  return files.filter((g) => g.toLowerCase().startsWith(s) && copy.test(g.toLowerCase().slice(s.length)))
}

async function decode(input: string, output: string) {
  // Every page is rendered and compared with the scan: a long fax takes a while.
  if (TIFF.test(input)) return void (await exec(process.env.PYTHON ?? "python3", [SCANS, "convert", input, output], { timeout: 5 * TIMEOUT_MS }))
  try {
    await exec("heif-dec", ["--quiet", "-q", QUALITY, input, output], { timeout: TIMEOUT_MS })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT" || process.platform !== "darwin") throw e
    await exec("sips", ["-s", "format", "jpeg", "-s", "formatOptions", QUALITY, input, "--out", output], { timeout: TIMEOUT_MS })
  }
}

/** Decodes `dir/<name>` into `<stem>.jpg` (`-1`, `-2`... for several images) or `<stem>.pdf`, and returns the new names. */
async function convert(dir: string, name: string, taken: readonly string[]): Promise<string[]> {
  // Inside the folder, so the result is a rename on the same filesystem.
  const tmp = await mkdtemp(join(dir, ".convert-"))
  try {
    const ext = `.${copyType(name)}`
    await decode(join(dir, name), join(tmp, copyName(name)))
    const names = [...taken]
    for (const out of (await readdir(tmp)).filter((f) => f.endsWith(ext)).sort()) {
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
 * Replaces every HEIC in `dir` (among `files`) with its JPEG, puts a PDF before every TIFF, and
 * returns the new list, in the same order. A file that fails to convert stays as it is.
 */
export async function replaceUnreadable(dir: string, files: readonly string[]): Promise<string[]> {
  let out = [...files]
  for (const name of files.filter((f) => UNREADABLE.test(f))) {
    try {
      let copies = copiesOf(name, out)
      if (!copies.length) copies = await convert(dir, name, out)
      if (!copies.length) throw new Error("nothing decoded")
      const keep = TIFF.test(name)
      if (!keep) await rm(join(dir, name), { force: true })
      const at = out.indexOf(name)
      const others = (list: string[]) => list.filter((f) => !copies.includes(f))
      out = [...others(out.slice(0, at)), ...copies, ...(keep ? [name] : []), ...others(out.slice(at + 1))]
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
