/**
 * Service worker registration and automatic updates (the plugin's own script is off: `injectRegister: false`).
 *
 * A deploy reaches every open client without anyone reloading by hand:
 *  - the app asks the server for a new worker when it comes back to the foreground (an installed iOS app
 *    resumes without navigating, so the browser would not check by itself) and every 15 minutes while visible;
 *  - the new worker takes over at once (skipWaiting + clientsClaim, vite.config.ts) and the page reloads onto
 *    the new build, unless the user is in the middle of something (typing, or a chat answer streaming in):
 *    then it waits until that ends or the app goes to the background.
 * The app is a single bundle, so a page still running the old build never asks for a chunk that is gone.
 * Navigations are network-first (vite.config.ts), so a relaunch after a deploy opens the new build directly.
 */

const CHECK_INTERVAL_MS = 15 * 60 * 1000
/** While a reload waits for the user, how often it looks again. */
const RETRY_MS = 5000

let busy = 0
let pending = false
let retry: ReturnType<typeof setTimeout> | undefined

/** Something that a reload would interrupt (a chat answer streaming in): call the returned function when it ends. */
export function holdUpdates() {
  busy++
  let released = false
  return () => {
    if (released) return
    released = true
    busy--
    reloadIfIdle()
  }
}

function typing() {
  const el = document.activeElement
  return (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.value.trim() !== ""
}

function reloadIfIdle() {
  clearTimeout(retry)
  if (!pending) return
  if (document.visibilityState === "visible" && (busy > 0 || typing())) {
    retry = setTimeout(reloadIfIdle, RETRY_MS)
    return
  }
  pending = false
  window.location.reload()
}

export function registerUpdates() {
  if (__DEMO__ || !import.meta.env.PROD || !("serviceWorker" in navigator)) return
  const sw = navigator.serviceWorker

  // The first install also claims the page: that is not an update.
  let updating = Boolean(sw.controller)
  sw.addEventListener("controllerchange", () => {
    if (!updating) {
      updating = true
      return
    }
    pending = true
    reloadIfIdle()
  })

  let registration: ServiceWorkerRegistration | undefined
  const check = () => {
    if (document.visibilityState !== "visible" || !navigator.onLine) return
    registration?.update().catch(() => undefined)
  }
  sw.register("/sw.js", { scope: "/" }).then(
    (r) => {
      registration = r
      setInterval(check, CHECK_INTERVAL_MS)
    },
    () => undefined // no worker: the app still works, it just won't update by itself
  )

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") reloadIfIdle()
    else check()
  })
}
