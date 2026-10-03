/**
 * The inbox: everything that arrives (email, uploads, shortcuts, Telegram, WhatsApp exports)
 * becomes a folder `inbox/<date>-<source>-<slug>-<id6>/` with item.json, content.md and the files.
 * The agent's triage job reads new items and updates deadlines and cases.
 */
import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs"
import { extname, join, sep } from "node:path"

import {
  fileName,
  type InboxDetail,
  InboxItem,
  type InboxSource,
  type InboxStatus,
  inboxFolder,
  isDocumentPath,
  parseWhatsAppExport,
  whatsappToMarkdown,
} from "@autocratico/core"
import { unzipSync } from "fflate"

import { locks, writeJson } from "./files.ts"
import { HEIC, replaceHeic } from "./images.ts"

export const MAX_UPLOAD = 25 * 1024 * 1024
const MAX_ZIP_ENTRIES = 2000
const MAX_UNZIPPED = 200 * 1024 * 1024

export type Upload = { name: string; data: Uint8Array }
export type NewItem = {
  source: InboxSource
  title?: string
  text?: string
  from?: string
  account?: string
  files?: Upload[]
}

function looksLikeWhatsApp(text: string): boolean {
  const chat = parseWhatsAppExport(text.slice(0, 20_000))
  return chat.messages.length >= 2 && chat.participants.length >= 1
}

function unzip(data: Uint8Array): Upload[] {
  let entries = 0
  let total = 0
  const out = unzipSync(data, {
    filter: (f) => {
      entries += 1
      total += f.originalSize
      if (entries > MAX_ZIP_ENTRIES || total > MAX_UNZIPPED) throw new Error("zip too large")
      return !f.name.endsWith("/") && !f.name.split("/").some((p) => p.startsWith(".") || p === "__MACOSX")
    },
  })
  return Object.entries(out).map(([name, bytes]) => ({ name: name.split("/").at(-1) ?? name, data: bytes }))
}

/**
 * Absolute path of an original file the web app may open (inbox/ or archive/), or null. The real
 * path must stay there too, so a symlink cannot reach secrets/ or anything else.
 */
export function documentFile(data: string, path: string): string | null {
  if (!isDocumentPath(path)) return null
  try {
    const root = realpathSync(data)
    const real = realpathSync(join(data, path))
    const inside = [join(root, "inbox"), join(root, "archive")].some((r) => real.startsWith(r + sep))
    return inside && statSync(real).isFile() ? real : null
  } catch {
    return null
  }
}

export class Inbox {
  readonly dir: string

  constructor(data: string) {
    this.dir = join(data, "inbox")
  }

  list(): InboxItem[] {
    if (!existsSync(this.dir)) return []
    const items: InboxItem[] = []
    for (const folder of readdirSync(this.dir)) {
      const file = join(this.dir, folder, "item.json")
      if (!existsSync(file)) continue
      try {
        items.push(InboxItem.parse({ ...JSON.parse(readFileSync(file, "utf8")), folder }))
      } catch {
        // a malformed item is skipped, not fatal
      }
    }
    return items.sort((a, b) => (a.received < b.received ? 1 : -1))
  }

  get(id: string): InboxDetail | null {
    const item = this.list().find((i) => i.id === id)
    if (!item) return null
    const file = join(this.dir, item.folder, "content.md")
    return { ...item, content: existsSync(file) ? readFileSync(file, "utf8") : "" }
  }

  /** Absolute path of an attachment, or null when the name is not one of the item's files. */
  file(id: string, name: string): string | null {
    const item = this.list().find((i) => i.id === id)
    return item && item.files.includes(name) ? join(this.dir, item.folder, name) : null
  }

  setStatus(ids: string[], status: InboxStatus, outcome?: string): Promise<void> {
    return locks.run(this.dir, () => {
      const wanted = new Set(ids)
      for (const item of this.list()) {
        if (!wanted.has(item.id)) continue
        const { folder, ...rest } = item
        writeJson(join(this.dir, folder, "item.json"), { ...rest, status, outcome: outcome ?? rest.outcome })
      }
    })
  }

  /**
   * Replaces HEIC photos with JPEGs, in the item and in the email it points to (archive/email):
   * one format only, one that the agent and every browser can show. Returns the item as updated.
   */
  async convertPhotos(item: InboxItem): Promise<InboxItem> {
    if (/^archive\/email\/[^/.][^/]*$/.test(item.ref)) {
      const email = join(this.dir, "..", item.ref)
      if (existsSync(email)) await replaceHeic(email, readdirSync(email))
    }
    if (!item.files.some((f) => HEIC.test(f))) return item
    const converted = await replaceHeic(join(this.dir, item.folder), item.files)
    return locks.run(this.dir, () => {
      const current = this.list().find((i) => i.id === item.id) ?? item
      const { folder, ...rest } = current
      const files = converted.filter((f) => existsSync(join(this.dir, folder, f)))
      // An item named after its photo keeps a name that matches what is there.
      const title = HEIC.test(rest.title) && !files.includes(rest.title) ? rest.title.replace(HEIC, ".jpg") : rest.title
      writeJson(join(this.dir, folder, "item.json"), { ...rest, title, files })
      return { ...current, title, files }
    })
  }

  /** Converts the photos of items that arrived before conversion existed (runs once at start). */
  async convertAll(): Promise<void> {
    for (const item of this.list()) await this.convertPhotos(item)
  }

  /** Items left halfway by a restart go back to `new`. */
  async recover(): Promise<void> {
    const stuck = this.list().filter((i) => i.status === "processing").map((i) => i.id)
    if (stuck.length) await this.setStatus(stuck, "new")
  }

  async add(n: NewItem): Promise<InboxItem> {
    return this.convertPhotos(await this.#write(n))
  }

  #write(n: NewItem): Promise<InboxItem> {
    return locks.run(this.dir, () => {
      const id = randomBytes(8).toString("hex")
      const received = new Date().toISOString()
      let files = n.files ?? []
      let source = n.source
      let content = n.text?.trim() ?? ""
      let title = n.title?.trim() ?? ""

      // A WhatsApp export arrives as a zip (chat + media) or a bare .txt.
      const zips = files.filter((f) => extname(f.name).toLowerCase() === ".zip")
      if (zips.length) files = [...files.filter((f) => !zips.includes(f)), ...zips.flatMap((z) => unzip(z.data))]
      const chatFile = files.find(
        (f) => extname(f.name).toLowerCase() === ".txt" && looksLikeWhatsApp(new TextDecoder().decode(f.data))
      )
      if (chatFile) {
        source = "whatsapp"
        const chat = parseWhatsAppExport(new TextDecoder().decode(chatFile.data))
        title ||= `WhatsApp: ${chat.participants.slice(0, 3).join(", ") || chatFile.name}`
        content = [content, whatsappToMarkdown(chat, title)].filter(Boolean).join("\n\n")
      }

      title ||= files[0]?.name ?? content.split("\n")[0]?.slice(0, 80) ?? ""
      title ||= "untitled"
      const folder = inboxFolder(received, source, title, id)
      const path = join(this.dir, folder)
      mkdirSync(path, { recursive: true })
      const names: string[] = []
      for (const f of files) {
        if (f === chatFile) continue
        const name = fileName(f.name, names)
        writeFileSync(join(path, name), f.data)
        names.push(name)
      }
      writeFileSync(join(path, "content.md"), content ? content + "\n" : "", "utf8")
      const item = InboxItem.parse({
        id,
        folder,
        source,
        status: "new",
        received,
        title: title.slice(0, 200),
        from: n.from ?? "",
        account: n.account ?? "",
        files: names,
        ref: "",
        outcome: "",
      })
      const { folder: _, ...stored } = item
      writeJson(join(path, "item.json"), stored)
      return item
    })
  }
}
