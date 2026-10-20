import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { deflateSync } from "node:zlib"

import { describe, expect, it } from "vitest"

import { copiesOf } from "../src/images.ts"
import { documentFile, Inbox } from "../src/inbox.ts"
import { owner, setup } from "./helpers.ts"

// A 1x1 white PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC",
  "base64"
)

describe("HEIC photos", () => {
  it("finds the JPEGs made from a photo", () => {
    expect(copiesOf("IMG_2.HEIC", ["IMG_2.HEIC", "IMG_2.jpg", "IMG_20.jpg"])).toEqual(["IMG_2.jpg"])
    expect(copiesOf("live.heif", ["live-1.jpg", "live-2.jpg", "live-b.jpg"])).toEqual(["live-1.jpg", "live-2.jpg"])
  })

  it.runIf(process.platform === "darwin")("keeps only the JPEG when a HEIC arrives", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "autocratico-"))
    writeFileSync(join(tmp, "w.png"), PNG)
    execFileSync("sips", ["-s", "format", "heic", join(tmp, "w.png"), "--out", join(tmp, "w.heic")], { stdio: "ignore" })
    const inbox = new Inbox(mkdtempSync(join(tmpdir(), "autocratico-")))

    const item = await inbox.add({ source: "upload", files: [{ name: "IMG_0001.HEIC", data: readFileSync(join(tmp, "w.heic")) }, { name: "note.pdf", data: PNG }] })

    expect(item.files).toEqual(["IMG_0001.jpg", "note.pdf"])
    expect(item.title).toBe("IMG_0001.jpg")
    expect(existsSync(join(inbox.dir, item.folder, "IMG_0001.jpg"))).toBe(true)
    expect(existsSync(join(inbox.dir, item.folder, "IMG_0001.HEIC"))).toBe(false)
    expect(inbox.get(item.id)?.files).toEqual(item.files)
  })

  it("drops a HEIC that already has its JPEG (items from before)", async () => {
    const inbox = new Inbox(mkdtempSync(join(tmpdir(), "autocratico-")))
    const item = await inbox.add({ source: "upload", files: [{ name: "a.jpg", data: PNG }] })
    const dir = join(inbox.dir, item.folder)
    writeFileSync(join(dir, "a.HEIC"), "old")
    const old = { ...item, files: ["a.HEIC", "a.jpg"] }

    const updated = await inbox.convertFiles(old)

    expect(updated.files).toEqual(["a.jpg"])
    expect(existsSync(join(dir, "a.HEIC"))).toBe(false)
  })
})

const has = (cmd: string, args: string[]) => {
  try {
    execFileSync(cmd, args, { stdio: "ignore" })
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== "ENOENT"
  }
}
// scripts/scans.py needs all of them (libtiff-tools, poppler-utils, ffmpeg), as the Docker image has.
const scanTools = has("tiff2pdf", ["-h"]) && has("tiffcp", ["-h"]) && has("pdftoppm", ["-v"]) && has("pdfinfo", ["-v"]) && has("ffmpeg", ["-version"])
const SCANS = fileURLToPath(new URL("../../../scripts/scans.py", import.meta.url))

const W = 400
const H = 560
/** Two pages that look nothing alike: bands across, then bands down. */
const PAGES = [(x: number, y: number) => Math.floor(y / 40) % 2 === 0 && x > 40 && x < 360, (x: number, y: number) => Math.floor(x / 40) % 2 === 1 && y > 40 && y < 520]

/**
 * A fax-style scan as couriers send them (Ghostscript's output): 1 bit per pixel, min-is-black,
 * Deflate, one strip per page, 200 dpi. tiff2pdf copied such pages into the PDF as they were and
 * labelled them CCITT fax data, so every reader drew a few streaks on a white page.
 */
function faxTiff(pages: ((x: number, y: number) => boolean)[]): Buffer {
  const row = W / 8
  const parts: Buffer[] = []
  const ifds: { ifd: Buffer; at: number }[] = []
  let at = 8
  pages.forEach((black, n) => {
    const raw = Buffer.alloc(row * H, 0xff) // min-is-black: 1 is white
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (black(x, y)) raw[y * row + (x >> 3)] &= ~(0x80 >> (x & 7))
    const strip = deflateSync(raw)
    const stripAt = at
    const resAt = at + strip.length + (strip.length % 2)
    const res = Buffer.alloc(8)
    res.writeUInt32LE(200, 0)
    res.writeUInt32LE(1, 4)
    const tags = [
      [256, 3, W], [257, 3, H], [258, 3, 1], [259, 3, 8], [262, 3, 1], [266, 3, 1], [273, 4, stripAt], [277, 3, 1],
      [278, 3, H], [279, 4, strip.length], [282, 5, resAt], [283, 5, resAt], [296, 3, 2], [297, 3, n | (pages.length << 16)],
    ]
    const ifd = Buffer.alloc(2 + tags.length * 12 + 4)
    ifd.writeUInt16LE(tags.length, 0)
    tags.forEach(([tag, type, value], i) => {
      ifd.writeUInt16LE(tag, 2 + i * 12)
      ifd.writeUInt16LE(type, 4 + i * 12)
      ifd.writeUInt32LE(tag === 297 ? 2 : 1, 6 + i * 12)
      ifd.writeUInt32LE(value, 10 + i * 12)
    })
    parts.push(strip, Buffer.alloc(strip.length % 2), res, ifd)
    ifds.push({ ifd, at: resAt + 8 })
    at = resAt + 8 + ifd.length
  })
  ifds.forEach(({ ifd }, i) => ifd.writeUInt32LE(ifds[i + 1]?.at ?? 0, ifd.length - 4))
  const header = Buffer.from([0x49, 0x49, 42, 0, 0, 0, 0, 0])
  header.writeUInt32LE(ifds[0].at, 4)
  return Buffer.concat([header, ...parts])
}

/** Share of the page's pixels that pdftoppm draws as `black` says (dark where it is black, light elsewhere). */
function shows(pdf: string, page: number, black: (x: number, y: number) => boolean): number {
  const out = execFileSync("pdftoppm", ["-f", `${page}`, "-l", `${page}`, "-gray", "-aa", "no", "-aaVector", "no", "-scale-to-x", `${W}`, "-scale-to-y", `${H}`, pdf])
  const header = /^P5\s+(\d+)\s+(\d+)\s+255\s/.exec(out.subarray(0, 32).toString("latin1"))
  if (!header || Number(header[1]) !== W || Number(header[2]) !== H) return 0
  const px = out.subarray(header[0].length)
  let right = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[y * W + x] < 128 === black(x, y)) right++
  return right / (W * H)
}

const pdfPages = (pdf: string) => Number(/^Pages:\s+(\d+)/m.exec(execFileSync("pdfinfo", [pdf], { encoding: "utf8" }))?.[1])
const scans = (...args: string[]) => execFileSync(process.env.PYTHON ?? "python3", [SCANS, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })

describe("TIFF scans", () => {
  it("finds the PDF made from a scan", () => {
    expect(copiesOf("Allegato_01.TIF", ["Allegato_01.TIF", "Allegato_01.pdf", "Allegato_01-1.jpg"])).toEqual(["Allegato_01.pdf"])
  })

  it.runIf(scanTools)("gives a fax-style scan a PDF that shows every page, and keeps the TIFF", async () => {
    const tiff = faxTiff(PAGES)
    const data = mkdtempSync(join(tmpdir(), "autocratico-"))
    const email = join(data, "archive", "email", "2026-10-17-customs-abc123")
    mkdirSync(email, { recursive: true })
    writeFileSync(join(email, "Allegato_01.tif"), tiff)
    writeFileSync(join(email, "message.md"), '---\nattachments: ["Allegato_01.tif", "note.txt"]\n---\n\nHello\n')
    writeFileSync(join(email, "note.txt"), "hi")
    const inbox = new Inbox(data)

    const item = await inbox.add({ source: "upload", files: [{ name: "scan.TIFF", data: tiff }] })
    await inbox.convertAll()

    expect(item.files).toEqual(["scan.pdf", "scan.TIFF"])
    expect(inbox.get(item.id)?.files).toEqual(item.files)
    for (const [dir, name, original] of [
      [join(inbox.dir, item.folder), "scan.pdf", "scan.TIFF"],
      [email, "Allegato_01.pdf", "Allegato_01.tif"],
    ]) {
      expect(readFileSync(join(dir, original))).toEqual(tiff)
      const pdf = join(dir, name)
      expect(pdfPages(pdf)).toBe(2)
      // Each page, rendered, is the scan's page (give or take a row at the edges): not a blank page
      // with streaks (about 0.6), not the other page.
      expect(shows(pdf, 1, PAGES[0])).toBeGreaterThan(0.97)
      expect(shows(pdf, 2, PAGES[1])).toBeGreaterThan(0.97)
    }
    const message = readFileSync(join(email, "message.md"), "utf8")
    expect(message).toContain('attachments: ["Allegato_01.pdf","Allegato_01.tif","note.txt"]')

    // Starting again changes nothing: no second PDF, same lists.
    const before = readFileSync(join(inbox.dir, item.folder, "item.json"), "utf8")
    await inbox.convertAll()
    expect(readFileSync(join(inbox.dir, item.folder, "item.json"), "utf8")).toBe(before)
    expect(readFileSync(join(email, "message.md"), "utf8")).toBe(message)
    expect(readdirSync(email).sort()).toEqual(["Allegato_01.pdf", "Allegato_01.tif", "message.md", "note.txt"])
  })

  it.runIf(scanTools)("keeps no PDF that does not show the scan", () => {
    const dir = mkdtempSync(join(tmpdir(), "autocratico-"))
    writeFileSync(join(dir, "scan.tif"), faxTiff(PAGES))
    writeFileSync(join(dir, "other.tif"), faxTiff([PAGES[1], PAGES[0]]))
    scans("convert", join(dir, "other.tif"), join(dir, "other.pdf"))

    expect(() => scans("check", join(dir, "scan.tif"), join(dir, "other.pdf"))).toThrow(/page 1 does not match/)
    expect(scans("check", join(dir, "other.tif"), join(dir, "other.pdf"))).toMatch(/^ok/)
  })

  it.runIf(scanTools)("lists the PDFs broken on 2026-10-18 and repairs them from the original", () => {
    const tiff = faxTiff(PAGES)
    const data = mkdtempSync(join(tmpdir(), "autocratico-"))
    const email = join(data, "archive", "email", "2026-10-18-customs-def456")
    mkdirSync(email, { recursive: true })
    // What the broken conversion left: the TIFF's Deflate strip labelled CCITTFaxDecode, the TIFF gone.
    const strip = deflateSync(Buffer.alloc((W / 8) * H, 0xff))
    const broken = Buffer.concat([
      Buffer.from(`%PDF-1.2 \n1 0 obj\n<< \n/Type /Catalog \n/Pages 3 0 R \n>>\nendobj\n2 0 obj\n<< \n/Producer (libtiff / tiff2pdf - 20240911)\n>>\nendobj\n`),
      Buffer.from(`7 0 obj\n<< \n/Type /XObject \n/Subtype /Image \n/Width ${W}\n/Height ${H}\n/BitsPerComponent 1\n/ColorSpace /DeviceGray \n`),
      Buffer.from(`/Filter /CCITTFaxDecode /DecodeParms << /K -1 /Columns ${W} /Rows ${H} /BlackIs1 true >>\n >>\nstream\n`),
      strip,
      Buffer.from("\nendstream\nendobj\n%%EOF\n"),
    ])
    writeFileSync(join(email, "Allegato_01.pdf"), broken)
    writeFileSync(join(email, "message.md"), '---\nattachments: ["Allegato_01.pdf","note.txt"]\n---\n\nHello\n')
    writeFileSync(join(email, "note.txt"), "hi")
    const elsewhere = mkdtempSync(join(tmpdir(), "autocratico-"))
    writeFileSync(join(elsewhere, "Allegato_01.tif"), tiff)
    writeFileSync(join(data, "archive", "letter.pdf"), "%PDF-1.4\n/Producer (Word)\n")

    expect(scans("scan", "--data", data)).toBe("archive/email/2026-10-18-customs-def456/Allegato_01.pdf\tbroken\toriginal here: no\n")

    // A dry run writes nothing.
    const plan = scans("repair", email, join(elsewhere, "Allegato_01.tif"))
    expect(plan).toContain("would put back Allegato_01.tif")
    expect(plan).toContain("would replace Allegato_01.pdf (broken)")
    expect(readdirSync(email).sort()).toEqual(["Allegato_01.pdf", "message.md", "note.txt"])
    expect(readFileSync(join(email, "Allegato_01.pdf"))).toEqual(broken)

    scans("repair", email, join(elsewhere, "Allegato_01.tif"), "--apply")

    expect(readFileSync(join(email, "Allegato_01.tif"))).toEqual(tiff)
    expect(shows(join(email, "Allegato_01.pdf"), 1, PAGES[0])).toBeGreaterThan(0.97)
    expect(shows(join(email, "Allegato_01.pdf"), 2, PAGES[1])).toBeGreaterThan(0.97)
    expect(readFileSync(join(email, "message.md"), "utf8")).toContain('attachments: ["Allegato_01.pdf", "Allegato_01.tif", "note.txt"]')
    expect(scans("scan", "--data", data)).toBe("")
    // Again: nothing to do.
    const pdf = readFileSync(join(email, "Allegato_01.pdf"))
    expect(scans("repair", email, join(elsewhere, "Allegato_01.tif"), "--apply")).toMatch(/^Allegato_01.tif: nothing to do/)
    expect(readFileSync(join(email, "Allegato_01.pdf"))).toEqual(pdf)
  })
})

describe("original files", () => {
  it("opens only files in inbox/ and archive/", () => {
    const { data } = setup()
    mkdirSync(join(data, "archive", "2026"), { recursive: true })
    writeFileSync(join(data, "archive", "2026", "letter.pdf"), "%PDF")
    mkdirSync(join(data, "inbox", "x"), { recursive: true })
    writeFileSync(join(data, "inbox", "x", "item.json"), "{}")
    mkdirSync(join(data, "secrets"), { recursive: true })
    writeFileSync(join(data, "secrets", "token.json"), "{}")
    symlinkSync(join(data, "secrets", "token.json"), join(data, "inbox", "x", "token.json"))

    expect(documentFile(data, "archive/2026/letter.pdf")).toMatch(/letter\.pdf$/)
    expect(documentFile(data, "archive/2026")).toBeNull()
    expect(documentFile(data, "inbox/x/item.json")).toBeNull()
    expect(documentFile(data, "inbox/x/token.json")).toBeNull()
    expect(documentFile(data, "inbox/../secrets/token.json")).toBeNull()
    expect(documentFile(data, "secrets/token.json")).toBeNull()
    expect(documentFile(data, "deadlines.toml")).toBeNull()
  })

  it("shows images inline and serves everything else as a download", async () => {
    const { app, data } = setup()
    const LOCAL = await owner(app)
    mkdirSync(join(data, "archive", "2026"), { recursive: true })
    writeFileSync(join(data, "archive", "2026", "photo.png"), PNG)
    writeFileSync(join(data, "archive", "2026", "page.html"), "<script>alert(1)</script>")

    const image = await app.request("/api/file?path=archive/2026/photo.png&as=view", { headers: LOCAL })
    expect(image.status).toBe(200)
    expect(image.headers.get("content-type")).toBe("image/png")
    expect(image.headers.get("content-disposition")).toBe("inline")

    const html = await app.request("/api/file?path=archive/2026/page.html&as=view", { headers: LOCAL })
    expect(html.headers.get("content-type")).toBe("application/octet-stream")
    expect(html.headers.get("content-disposition")).toMatch(/^attachment/)

    const thumb = await app.request("/api/file?path=archive/2026/photo.png&as=thumb", { headers: LOCAL })
    expect(thumb.status).toBe(200)
    expect(thumb.headers.get("content-type")).toMatch(/^image\//)

    expect((await app.request("/api/file?path=secrets/x", { headers: LOCAL })).status).toBe(404)
  })
})
