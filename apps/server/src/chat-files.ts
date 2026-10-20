/**
 * Files attached to a chat message (photos, PDFs, documents): saved in chats/files/<date>-<id>/,
 * server-owned like the rest of chats/, and handed to the agent as paths it reads with Read (images and
 * PDFs are shown to it). Nothing is filed by this: when one is a document to keep, the agent files it
 * with an inbox block listing it in "files" (the server copies it into the new inbox item). HEIC photos
 * become JPEGs on arrival, and TIFF scans get a PDF beside them.
 */
import { randomBytes } from "node:crypto"
import { mkdirSync, realpathSync, statSync, writeFileSync } from "node:fs"
import { extname, join, sep } from "node:path"

import { fileName, today } from "@autocratico/core"

import { IMAGE_TYPES, replaceUnreadable, UNREADABLE } from "./images.ts"
import type { Upload } from "./inbox.ts"

export const MAX_CHAT_FILES = 10
const FOLDER = /^chats\/files\/\d{4}-\d{2}-\d{2}-[0-9a-f]{8}\/[^/\\]+$/

export type ChatFile = { path: string; name: string; image: boolean; size: number }

export async function saveChatFiles(data: string, uploads: Upload[], timeZone: string): Promise<ChatFile[]> {
  const folder = `${today(timeZone)}-${randomBytes(4).toString("hex")}`
  const dir = join(data, "chats", "files", folder)
  mkdirSync(dir, { recursive: true })
  let names: string[] = []
  for (const u of uploads) {
    const name = fileName(u.name, names)
    writeFileSync(join(dir, name), u.data)
    names.push(name)
  }
  if (names.some((n) => UNREADABLE.test(n))) names = await replaceUnreadable(dir, names)
  return names.map((name) => ({
    path: `chats/files/${folder}/${name}`,
    name,
    image: Boolean(IMAGE_TYPES[extname(name).toLowerCase()]),
    size: statSync(join(dir, name)).size,
  }))
}

/** Absolute path of a chat attachment, or null: only files under chats/files/, real path checked. */
export function chatFile(data: string, path: string): string | null {
  if (!FOLDER.test(path) || path.split("/").some((p) => p.startsWith("."))) return null
  try {
    const root = realpathSync(join(data, "chats", "files"))
    const real = realpathSync(join(data, path))
    return real.startsWith(root + sep) && statSync(real).isFile() ? real : null
  } catch {
    return null
  }
}

/** What the agent is told about the files of a message. */
export function filesNote(files: string[]): string {
  return `[Server: the user attached ${files.length === 1 ? "a file" : `${files.length} files`} to this message: ${files.map((f) => `\`${f}\``).join(", ")}. Read ${files.length === 1 ? "it" : "them"} with Read before answering (images and PDFs are shown to you). When the user asks for a widget and attaches a screenshot or a sketch of an interface, design the widget after it. If one is a document to keep (a notice, a bill, a receipt), file it with an inbox block that lists it in "files".]`
}
