// Color palettes: every palette in lib/palettes.ts has its colors in index.css (light and dark), the launch
// screen in index.html and the landing page; the browser bar colors agree everywhere.
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { PALETTES, THEME_COLOR } from "../src/lib/palettes"

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")
const css = read("../src/index.css")
const html = read("../index.html")
const site = read("../../site/src/styles.css")

/** Custom properties set by the rule whose selector list starts with `selector`. */
function tokens(source: string, selector: string): Map<string, string> {
  const at = source.indexOf(`${selector}`)
  if (at < 0) return new Map()
  const body = source.slice(source.indexOf("{", at) + 1, source.indexOf("}", at))
  return new Map([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

/** oklch(L C H) to #rrggbb. */
function hex(value: string): string {
  const [L, C, H] = value.match(/oklch\(([^)]+)\)/)![1].split(/\s+/).map(Number)
  const h = (H * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  const encode = (x: number) => {
    const c = Math.min(1, Math.max(0, x))
    return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255)
  }
  return "#" + rgb.map((x) => encode(x).toString(16).padStart(2, "0")).join("")
}

// What a palette must set, in light and in dark: everything that is not a status or money color.
const NEUTRAL = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground",
  "accent", "accent-foreground", "border", "input", "ring",
  "chart-1", "chart-2", "chart-3", "chart-4", "chart-5",
  "sidebar", "sidebar-foreground", "sidebar-primary", "sidebar-primary-foreground",
  "sidebar-accent", "sidebar-accent-foreground", "sidebar-border", "sidebar-ring",
  "glass", "glass-border", "status-bar", "texture",
]

describe("palettes", () => {
  const others = PALETTES.filter((p) => p !== "mono")

  it.each(others)("%s sets every neutral token in light and dark", (id) => {
    const light = tokens(css, `\n[data-palette="${id}"] {`)
    const dark = tokens(css, `\n.dark[data-palette="${id}"],`)
    expect([...light.keys()].sort()).toEqual(expect.arrayContaining(NEUTRAL))
    expect([...dark.keys()].sort()).toEqual(expect.arrayContaining(NEUTRAL))
    expect(light.has("deco-h") && light.has("deco-c")).toBe(true)
  })

  it("keeps Monocromo as the base tokens", () => {
    expect(css).toContain(':root,\n[data-palette="mono"] {')
    expect(css).toContain('.dark,\n.dark [data-palette="mono"] {')
  })

  it.each(others)("%s: the browser bar is its light --status-bar", (id) => {
    expect(THEME_COLOR[id]).toBe(hex(tokens(css, `\n[data-palette="${id}"] {`).get("status-bar")!))
  })

  it("index.html restores the same browser bar colors", () => {
    const bar = html.match(/var bar = (\{[^}]+\})/)![1].replace(/(\w+):/g, '"$1":')
    expect(JSON.parse(bar)).toEqual(THEME_COLOR)
  })

  it.each(others)("%s has a launch screen and landing page colors", (id) => {
    expect(html).toContain(`[data-palette="${id}"] { --splash-bg`)
    expect(html).toContain(`.dark[data-palette="${id}"] { --splash-bg`)
    expect(site.includes(`[data-palette="${id}"]`), "apps/site/src/styles.css").toBe(true)
  })
})
