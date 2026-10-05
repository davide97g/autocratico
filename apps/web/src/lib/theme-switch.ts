import { flushSync } from "react-dom"

type Theme = "dark" | "light" | "system"

/**
 * Changes the theme with the new one spreading as a circle from `origin` (the control that asked for it).
 * Without the View Transitions API, or with animations turned down, it just switches.
 */
export function switchTheme(setTheme: (t: Theme) => void, next: Theme, origin?: { x: number; y: number }) {
  const reduced =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.hasAttribute("data-reduce-motion")
  if (!document.startViewTransition || reduced) {
    setTheme(next)
    return
  }
  const x = origin?.x ?? window.innerWidth / 2
  const y = origin?.y ?? window.innerHeight / 2
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
  const resolved = next === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : next
  const transition = document.startViewTransition(() => {
    // The provider applies the class in an effect: set it here too, so the snapshot is taken on the new theme.
    document.documentElement.classList.remove("light", "dark")
    document.documentElement.classList.add(resolved)
    flushSync(() => setTheme(next))
  })
  void transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 520, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" }
    )
  })
}

/** The theme that is not the one on screen now. */
export function otherTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "light" : "dark"
}
