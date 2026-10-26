/**
 * Prints a PDF form's layout for the chat agent: its fillable fields, or the blanks of a flat form
 * and every line of text with its position (core/forms.ts). Read-only; the path is relative to the
 * data folder and must be a chat attachment or a file of inbox/ or archive/.
 *
 *   node apps/server/src/form-layout.ts chats/files/2026-10-26-1a2b3c4d/form.pdf
 */
import { homedir } from "node:os"
import { resolve } from "node:path"

import { ROOT } from "./config.ts"
import { describeForm } from "./forms.ts"

const data = resolve(process.env.AUTOCRATICO_DATA?.trim().replace(/^~/, homedir()) || resolve(ROOT, "data"))
const path = process.argv.slice(2).join(" ").trim()
if (!path) {
  console.error("usage: node apps/server/src/form-layout.ts <path of the PDF, relative to the data folder>")
  process.exit(2)
}
try {
  console.log(await describeForm(data, path.replace(/^\.\//, "")))
} catch (e) {
  console.error((e as Error).message)
  process.exit(1)
}
