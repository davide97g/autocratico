// The demo's documents, drawn on the visitor's device when they are opened: scans and photos on a
// canvas, PDFs written by hand. Nothing is downloaded and there are no binaries in the repository.
import { state } from "./state"
import type { DocSpec } from "./state"

const cache = new Map<string, string>()

/** What `/api/file?path=…` would serve: an address the browser can show or download. */
export function fileUrl(path: string): string {
  const hit = cache.get(path)
  if (hit) return hit
  const spec = state().docs[path]
  const url = spec ? render(path, spec) : missing(path)
  cache.set(path, url)
  return url
}

/** A file added in this tab: kept as an object URL, and as a data URL when it is small enough to survive a reload. */
export function remember(path: string, file: File) {
  cache.set(path, URL.createObjectURL(file))
}

function render(path: string, spec: DocSpec): string {
  if (spec.kind === "upload") return spec.data ?? missing(path)
  if (spec.kind === "pdf") return pdfUrl(spec.title, spec.lines)
  return scanUrl(spec, /\.png$/i.test(path) ? "image/png" : "image/jpeg")
}

function missing(path: string): string {
  return pdfUrl("File non disponibile", [
    path,
    "Nella demo i file caricati restano solo finché la scheda è aperta e c'è spazio.",
  ])
}

// ---------- scans and photos ----------

function scanUrl(
  spec: Extract<DocSpec, { kind: "scan" }>,
  mime: string
): string {
  if (typeof document === "undefined") return ""
  const card = spec.tone === "card"
  const photo = spec.tone === "photo"
  const W = card ? 1012 : 900
  const H = card ? 638 : 1200
  const c = document.createElement("canvas")
  c.width = W
  c.height = H
  const g = c.getContext("2d")
  if (!g) return ""
  // The surface it lies on, then the paper or the card.
  g.fillStyle = photo ? "#5b5f63" : "#e9e7e1"
  g.fillRect(0, 0, W, H)
  const pad = photo ? 70 : card ? 0 : 0
  g.save()
  if (photo) {
    g.translate(W / 2, H / 2)
    g.rotate(-0.025)
    g.translate(-W / 2, -H / 2)
    g.shadowColor = "rgba(0,0,0,.35)"
    g.shadowBlur = 30
  }
  g.fillStyle = card ? "#f3f1ea" : "#fbfaf6"
  roundRect(g, pad, pad, W - pad * 2, H - pad * 2, card ? 36 : 6)
  g.fill()
  g.restore()

  const x = pad + (card ? 56 : 72)
  let y = pad + (card ? 80 : 110)
  g.fillStyle = "#8a8578"
  g.font = `600 ${card ? 22 : 24}px system-ui, sans-serif`
  g.fillText(spec.issuer.toUpperCase(), x, y)
  y += card ? 56 : 70
  g.fillStyle = "#1d1d1b"
  g.font = `600 ${card ? 40 : 46}px system-ui, sans-serif`
  g.fillText(spec.title, x, y)
  y += card ? 30 : 40
  g.fillStyle = "#d8d4c8"
  g.fillRect(x, y, W - pad * 2 - (x - pad) * 2, 3)
  y += card ? 56 : 70
  g.fillStyle = "#33322e"
  g.font = `${card ? 28 : 30}px ui-monospace, monospace`
  for (const line of spec.lines) {
    g.fillText(line, x, y, W - x * 2)
    y += card ? 46 : 54
  }
  if (card) {
    // Where the photo goes on an identity card.
    g.fillStyle = "#d9d5ca"
    roundRect(g, W - 280, 200, 200, 250, 12)
    g.fill()
  } else {
    // Filler text, faint, as on a real notice.
    g.fillStyle = "#e3e0d7"
    for (let k = 0; k < 9 && y < H - pad - 160; k++) {
      g.fillRect(x, y, (W - x * 2) * (0.6 + ((k * 37) % 40) / 100), 14)
      y += 34
    }
  }
  // Made up, and it says so.
  g.save()
  g.translate(W / 2, H / 2)
  g.rotate(-0.35)
  g.fillStyle = "rgba(190, 60, 50, .16)"
  g.font = `800 ${card ? 120 : 150}px system-ui, sans-serif`
  g.textAlign = "center"
  g.fillText("ESEMPIO", 0, 40)
  g.restore()
  return c.toDataURL(mime, 0.86)
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

// ---------- PDF ----------

/** Latin-1 text for a PDF string: accents as octal escapes, the euro sign as WinAnsi 0x80. */
function pdfText(s: string): string {
  let out = ""
  for (const ch of s) {
    const code = ch === "€" ? 0x80 : ch.charCodeAt(0)
    if (ch === "(" || ch === ")" || ch === "\\") out += `\\${ch}`
    else if (code >= 32 && code < 127) out += ch
    else if (code < 256) out += `\\${code.toString(8).padStart(3, "0")}`
    else out += "?"
  }
  return out
}

/** A one-page A4 PDF with a title and lines of text, and the same "example" mark as the scans. */
export function pdfBytes(title: string, lines: string[]): Uint8Array {
  const body = [
    "BT /F1 9 Tf 0.55 0.53 0.48 rg 56 790 Td (AUTOCRATICO DEMO - DOCUMENTO DI ESEMPIO) Tj ET",
    `BT /F2 20 Tf 0.1 0.1 0.1 rg 56 750 Td (${pdfText(title)}) Tj ET`,
    "0.85 0.83 0.78 RG 1 w 56 735 m 539 735 l S",
    ...lines.map(
      (l, i) =>
        `BT /F1 12 Tf 0.2 0.2 0.18 rg 56 ${705 - i * 22} Td (${pdfText(l)}) Tj ET`
    ),
    "q 0.95 0.8 0.78 rg BT /F2 90 Tf 0.94 -0.34 0.34 0.94 120 300 Tm (ESEMPIO) Tj ET Q",
  ].join("\n")
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
  ]
  let out = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((o, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  // Every character above is one byte (escapes keep the text ASCII).
  return Uint8Array.from(out, (ch) => ch.charCodeAt(0))
}

function pdfUrl(title: string, lines: string[]): string {
  if (typeof URL.createObjectURL !== "function") return ""
  return URL.createObjectURL(
    new Blob([pdfBytes(title, lines) as BlobPart], { type: "application/pdf" })
  )
}
