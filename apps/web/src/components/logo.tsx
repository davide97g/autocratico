import { cn } from "cn"

/** The letter of the mark, the same path as public/icons/icon.svg and the launch screen in index.html. */
const LETTER = "M44 20h12l21 60H64l-4.5-15h-19L36 80H23zm-6 36h24l-12-34z"

/** The app's mark: a highlight runs across it on hover, and it settles in once when it first appears. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("logo-mark group/logo relative inline-flex shrink-0 overflow-hidden rounded-md bg-primary text-primary-foreground", className)}>
      <svg viewBox="0 0 100 100" className="size-full" aria-hidden>
        <path fill="currentColor" fillRule="evenodd" d={LETTER} className="logo-letter" />
      </svg>
      <span aria-hidden className="logo-shine pointer-events-none absolute inset-0" />
    </span>
  )
}

/** The launch screen stays until the draw has finished, then fades out as the app comes in. */
const SPLASH_MIN_MS = 1150
const SPLASH_OUT_MS = 400

export function dismissSplash() {
  const el = document.getElementById("splash")
  if (!el || el.dataset.leaving) return
  el.dataset.leaving = "1"
  const skip = document.documentElement.hasAttribute("data-no-splash")
  const wait = skip ? 0 : Math.max(0, SPLASH_MIN_MS - performance.now())
  window.setTimeout(() => {
    el.classList.add("splash-out")
    window.setTimeout(() => el.remove(), skip ? 0 : SPLASH_OUT_MS)
  }, wait)
}
