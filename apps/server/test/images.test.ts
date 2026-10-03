import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { needsCopy } from "../src/images.ts"
import { Inbox } from "../src/inbox.ts"

// A 1x1 white PNG, turned into HEIC with sips (macOS only).
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC",
  "base64"
)

describe("HEIC copies", () => {
  it("knows which photos still need a JPEG copy", () => {
    expect(needsCopy(["IMG_1.HEIC", "IMG_2.heic", "IMG_2.jpg", "live.heif", "live-1.jpg", "note.pdf"])).toEqual(["IMG_1.HEIC"])
    expect(needsCopy(["a.heic", "a-b.jpg"])).toEqual(["a.heic"])
  })

  it.runIf(process.platform === "darwin")("adds the copy to the item before triage", async () => {
    const data = mkdtempSync(join(tmpdir(), "autocratico-"))
    const inbox = new Inbox(data)
    const png = join(data, "w.png")
    writeFileSync(png, PNG)
    execFileSync("sips", ["-s", "format", "heic", png, "--out", join(data, "w.heic")], { stdio: "ignore" })
    const item = await inbox.add({ source: "upload", files: [{ name: "IMG_0001.HEIC", data: readFileSync(join(data, "w.heic")) }] })

    const updated = await inbox.readable(item)
    expect(updated.files).toEqual(["IMG_0001.HEIC", "IMG_0001.jpg"])
    expect(existsSync(join(inbox.dir, item.folder, "IMG_0001.jpg"))).toBe(true)
    expect(inbox.get(item.id)?.files).toEqual(updated.files)
    expect((await inbox.readable(updated)).files).toEqual(updated.files)
  })
})
