import { flushSync } from "react-dom"

import { applyPalette, type Palette } from "@/lib/palettes"

type Theme = "dark" | "light" | "system"
type Origin = { x: number; y: number }

/**
 * Applies a change to the page's look with the new look spreading as a circle from `origin`
 * (the control that asked for it). Without the View Transitions API, or with animations turned
 * down, it just applies it. `apply` must put the change on <html> itself, so the snapshot is taken
 * on the new look even though React applies it later in an effect.
 */
function reveal(apply: () => void, origin?: Origin) {
  const reduced =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.hasAttribute("data-reduce-motion")
  if (!document.startViewTransition || reduced) {
    apply()
    return
  }
  const x = origin?.x ?? window.innerWidth / 2
  const y = origin?.y ?? window.innerHeight / 2
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
  const transition = document.startViewTransition(apply)
  void transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 520, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" }
    )
  })
}

/** Changes light/dark with the circle reveal. */
export function switchTheme(setTheme: (t: Theme) => void, next: Theme, origin?: Origin) {
  const resolved = next === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : next
  reveal(() => {
    document.documentElement.classList.remove("light", "dark")
    document.documentElement.classList.add(resolved)
    flushSync(() => setTheme(next))
  }, origin)
}

/** Changes the color palette with the circle reveal. */
export function switchPalette(setPalette: (p: Palette) => void, next: Palette, origin?: Origin) {
  reveal(() => {
    applyPalette(next)
    flushSync(() => setPalette(next))
  }, origin)
}

/** The theme that is not the one on screen now. */
export function otherTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "light" : "dark"
}
