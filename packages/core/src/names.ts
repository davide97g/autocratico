/** File and folder names built from untrusted text (email subjects, attachment names). Mirrors scripts/gmail.py. */

export function slug(s: string, max = 50): string {
  const clean = s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}_\s-]/gu, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "")
  return clean || "untitled"
}

const RESERVED = new Set(["item.json", "content.md", "message.md"])

/** Safe, unique file name for an attachment (the name comes from the sender). */
export function fileName(name: string, taken: readonly string[]): string {
  let n = name
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 150)
  if (!n) n = "attachment"
  if (RESERVED.has(n) || taken.includes(n)) {
    const dot = n.lastIndexOf(".")
    const [stem, ext] = dot > 0 ? [n.slice(0, dot), n.slice(dot)] : [n, ""]
    let i = 2
    while (taken.includes(`${stem}-${i}${ext}`)) i++
    n = `${stem}-${i}${ext}`
  }
  return n
}

/** `inbox/<YYYY-MM-DD>-<source>-<slug>-<id6>`. */
export function inboxFolder(received: string, source: string, title: string, id: string): string {
  return `${received.slice(0, 10)}-${source}-${slug(title, 40)}-${id.slice(-6)}`
}
