/**
 * Color palettes, on top of light and dark. The colors live in index.css under [data-palette="<id>"];
 * PrefsProvider puts the chosen one on <html> and index.html restores it before the first paint.
 * Names and taglines are in i18n (`palettes`).
 */
export const PALETTES = ["mono", "roma", "barocco", "espresso", "capri"] as const

export type Palette = (typeof PALETTES)[number]

export const DEFAULT_PALETTE: Palette = "mono"

export function isPalette(value: unknown): value is Palette {
  return typeof value === "string" && (PALETTES as readonly string[]).includes(value)
}

/**
 * The browser bar color (<meta name="theme-color">): each palette's --status-bar in light mode, as hex.
 * Mirrored in index.html's boot script; test/palettes.test.ts checks both against index.css.
 */
export const THEME_COLOR: Record<Palette, string> = {
  mono: "#1a1a1a",
  roma: "#341e13",
  barocco: "#3d1017",
  espresso: "#2d1a10",
  capri: "#062b5f",
}

/** Puts a palette on the page: the attribute the CSS reads and the browser bar color. */
export function applyPalette(palette: Palette) {
  document.documentElement.setAttribute("data-palette", palette)
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[palette])
}
