/**
 * What lies behind a `source` path (deadlines, case lines): the email, inbox item or file, read for
 * the details view. Same boundary as documentFile() in inbox.ts: only inbox/ and archive/, real
 * paths checked, no hidden or server files; everything here comes from strangers and is shown as
 * plain text.
 */
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, realpathSync, statSync } from "node:fs"
import { basename, dirname, join, relative, sep } from "node:path"

import { type ArchiveEntry, isDocumentFile, isDocumentPath, type SourceInfo } from "@autocratico/core"
import { listDocuments } from "@autocratico/core/node"

const MAX_TEXT = 20_000

/** The real path of `path` when it is inside the data folder's inbox/ or archive/. */
function inside(data: string, path: string): string | null {
  if (!isDocumentPath(path)) return null
  try {
    const root = realpathSync(data)
    const real = realpathSync(join(data, path))
    return [join(root, "inbox"), join(root, "archive")].some((r) => real.startsWith(r + sep)) ? real : null
  } catch {
    return null
  }
}

function read(file: string): string {
  try {
    return readFileSync(file, "utf8")
  } catch {
    return ""
  }
}

/** message.md written by scripts/gmail.py: `key: value` lines between ---, then the body. */
export function parseMessage(md: string): { meta: Record<string, string>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(md)
  if (!m) return { meta: {}, body: md }
  const meta: Record<string, string> = {}
  for (const line of m[1].split("\n")) {
    const at = line.indexOf(": ")
    if (at < 0) continue
    const raw = line.slice(at + 2).trim()
    let value: unknown = raw
    if (raw.startsWith('"')) {
      try {
        value = JSON.parse(raw)
      } catch {
        // keep it as written
      }
    }
    meta[line.slice(0, at).trim()] = typeof value === "string" ? value : raw
  }
  // Messages filed before the English schema used Italian keys.
  for (const [it, en] of Object.entries(ITALIAN_KEYS)) if (meta[en] === undefined && meta[it] !== undefined) meta[en] = meta[it]
  return { meta, body: m[2].trim() }
}

const ITALIAN_KEYS: Record<string, string> = { data: "date", da: "from", a: "to", oggetto: "subject", etichette: "labels", allegati: "attachments", casella: "account" }

/** Gmail addresses by mailbox name, written by scripts/gmail.py at each sync. */
function mailboxes(data: string): Record<string, string> {
  try {
    return JSON.parse(read(join(data, "archive", "email", ".mailboxes.json"))) as Record<string, string>
  } catch {
    return {}
  }
}

/** The single address in a header like `Name <a@b.it>`, else null. */
function address(header: string | undefined): string | null {
  const found = (header ?? "").match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? []
  return found.length === 1 ? found[0] : null
}

/** The message in Gmail's web app (or the Gmail app on a phone), in the mailbox that received it. */
export function gmailLink(meta: Record<string, string>, known: Record<string, string> = {}): string | null {
  const id = meta.thread || meta.id
  if (!id || !/^[0-9a-f]+$/i.test(id)) return null
  const only = Object.values(known).length === 1 ? Object.values(known)[0] : null
  const mailbox = meta.mailbox || (meta.account && known[meta.account]) || address(meta.to) || only
  return mailbox ? `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(mailbox)}#all/${id}` : `https://mail.google.com/mail/u/0/#all/${id}`
}

function cut(text: string) {
  return { text: text.slice(0, MAX_TEXT), truncated: text.length > MAX_TEXT }
}

function email(data: string, folder: string, path: string): SourceInfo {
  const { meta, body } = parseMessage(read(join(data, folder, "message.md")))
  return {
    path,
    kind: "email",
    title: meta.subject || basename(folder),
    from: meta.from ?? "",
    date: meta.date || null,
    account: meta.account ?? "",
    link: gmailLink(meta, mailboxes(data)),
    ...cut(body),
    files: listDocuments(data, [folder]).filter((f) => !f.endsWith("/message.md")),
  }
}

/** Describe `path` (a file or folder under inbox/ or archive/); null when it is not one we may show. */
export function describeSource(data: string, path: string): SourceInfo | null {
  const clean = path.replace(/\/+$/, "")
  const real = inside(data, clean)
  if (!real) return null
  const isFile = statSync(real).isFile()
  const folder = isFile ? dirname(clean) : clean
  const realFolder = isFile ? dirname(real) : real

  // An email from scripts/gmail.py, or a file attached to one.
  if (existsSync(join(realFolder, "message.md"))) {
    const info = email(data, folder, clean)
    return isFile && !clean.endsWith("/message.md") ? { ...info, files: [clean, ...info.files.filter((f) => f !== clean)] } : info
  }

  // An inbox item: what arrived, its text, its files, and the email it points to.
  const itemFile = join(realFolder, "item.json")
  if (clean.startsWith("inbox/") && existsSync(itemFile)) {
    let item: Record<string, unknown> = {}
    try {
      item = JSON.parse(read(itemFile)) as Record<string, unknown>
    } catch {
      // unreadable item.json: show the files only
    }
    const ref = typeof item.ref === "string" ? item.ref : ""
    if (ref && inside(data, ref) && existsSync(join(data, ref, "message.md"))) return { ...email(data, ref, clean), kind: "email" }
    const files = listDocuments(data, [folder])
    return {
      path: clean,
      kind: "inbox",
      title: typeof item.title === "string" && item.title ? item.title : basename(folder),
      from: typeof item.from === "string" ? item.from : "",
      date: typeof item.received === "string" ? item.received : null,
      account: typeof item.account === "string" ? item.account : "",
      link: null,
      ...cut(read(join(realFolder, "content.md")).trim()),
      files: isFile ? [clean, ...files.filter((f) => f !== clean)] : files,
    }
  }

  return {
    path: clean,
    kind: isFile ? "file" : "folder",
    title: basename(clean),
    from: "",
    date: null,
    account: "",
    link: null,
    text: "",
    truncated: false,
    files: isFile ? [clean] : listDocuments(data, [clean]),
  }
}

/** The start of a file: enough for message.md's header. */
function head(file: string, bytes = 4096): string {
  const fd = openSync(file, "r")
  try {
    const buf = Buffer.alloc(bytes)
    return buf.subarray(0, readSync(fd, buf, 0, bytes, 0)).toString("utf8")
  } finally {
    closeSync(fd)
  }
}

/** Everything in archive/: filed emails (from their header) and documents, newest first. */
export function listArchive(data: string): ArchiveEntry[] {
  const root = join(data, "archive")
  if (!existsSync(root)) return []
  const out: ArchiveEntry[] = []
  const emails = join(root, "email")
  if (existsSync(emails)) {
    for (const folder of readdirSync(emails)) {
      const file = join(emails, folder, "message.md")
      if (folder.startsWith(".") || !existsSync(file)) continue
      const text = head(file)
      const { meta } = parseMessage(text.includes("\n---\n", 4) ? text : `${text}\n---\n`)
      let attachments = 0
      try {
        attachments = (JSON.parse(meta.attachments ?? "[]") as unknown[]).length
      } catch {
        // header cut or unreadable: count unknown
      }
      out.push({
        path: `archive/email/${folder}`,
        kind: "email",
        title: meta.subject || folder,
        from: meta.from ?? "",
        date: meta.date || folder.slice(0, 10),
        account: meta.account ?? "",
        files: attachments,
      })
    }
  }
  // Documents filed by the agent: archive/<year>/<area>/..., anything but archive/email.
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith(".")) continue
      const full = join(dir, name)
      const rel = relative(data, full).split(sep).join("/")
      if (rel === "archive/email") continue
      const stat = statSync(full)
      if (stat.isDirectory()) walk(full)
      else if (stat.isFile() && isDocumentFile(name)) {
        out.push({ path: rel, kind: "file", title: name, from: "", date: stat.mtime.toISOString(), account: rel.split("/").slice(1, -1).join(" / "), files: 0 })
      }
    }
  }
  walk(root)
  return out.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
}
