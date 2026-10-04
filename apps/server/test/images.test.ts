import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

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

    const updated = await inbox.convertPhotos(old)

    expect(updated.files).toEqual(["a.jpg"])
    expect(existsSync(join(dir, "a.HEIC"))).toBe(false)
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
