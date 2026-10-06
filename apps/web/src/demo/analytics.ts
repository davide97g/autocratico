// Google Analytics 4 for the public demo, loaded only after the visitor says yes (same rules as the
// landing page, apps/site/src/analytics.ts): before a choice, and after a no, no Google script runs and
// no cookie is set. The choice lasts six months. Without GA_MEASUREMENT_ID at build time, nothing at all.
//
// Events carry fixed names and categories only: never what people type, upload or name their register.

type Params = Record<string, string | number | boolean | undefined>
export type Choice = "granted" | "denied"

const GA_ID = __DEMO_GA_ID__
const KEY = "autocratico-consent"
const ASK_AGAIN_MS = 180 * 24 * 60 * 60 * 1000

declare global {
  interface Window {
    dataLayer?: unknown[]
    [key: `ga-disable-${string}`]: boolean | undefined
  }
}

let granted = false
let loaded = false

// gtag.js reads the `arguments` object, not an array: keep the function form.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function gtag(..._args: unknown[]) {
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer!.push(arguments)
}

export const analyticsEnabled = () => Boolean(GA_ID)

/** Sends a GA4 event; a no-op without consent. */
export function track(name: string, params: Params = {}) {
  if (granted && loaded) gtag("event", name, params)
}

export function storedChoice(): Choice | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as {
      analytics?: Choice
      at?: number
    } | null
    if (
      !v?.analytics ||
      typeof v.at !== "number" ||
      Date.now() - v.at > ASK_AGAIN_MS
    )
      return null
    return v.analytics
  } catch {
    return null
  }
}

function load() {
  window[`ga-disable-${GA_ID}`] = false
  if (loaded) return
  loaded = true
  window.dataLayer = window.dataLayer ?? []
  gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  })
  gtag("js", new Date())
  gtag("config", GA_ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_domain: location.hostname,
    cookie_expires: 60 * 60 * 24 * 390, // 13 months
    // Hash routes are the views: the page path stays "/" and the view goes in its own event.
    send_page_view: true,
  })
  const s = document.createElement("script")
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`
  document.head.append(s)
}

/** Stops GA and removes its cookies on this host and its parent domains. */
function unload() {
  window[`ga-disable-${GA_ID}`] = true
  if (loaded) gtag("consent", "update", { analytics_storage: "denied" })
  const names = document.cookie
    .split(";")
    .map((c) => c.split("=")[0].trim())
    .filter((n) => n === "_ga" || n.startsWith("_ga_") || n === "_gid")
  const parts = location.hostname.split(".")
  const domains = [""]
  for (let i = 0; i < parts.length - 1; i++)
    domains.push(`; domain=.${parts.slice(i).join(".")}`)
  for (const n of names)
    for (const d of domains) document.cookie = `${n}=; max-age=0; path=/${d}`
}

export function choose(choice: Choice) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ analytics: choice, at: Date.now() })
    )
  } catch {
    // private mode: asked again next visit
  }
  apply(choice)
  if (choice === "granted") track("consent_granted")
}

export function apply(choice: Choice) {
  if (!GA_ID) return
  granted = choice === "granted"
  if (granted) load()
  else unload()
}

/** Views opened (`#deadlines`, `#activity/…`): the view's name only. */
export function trackViews() {
  let last = ""
  const send = () => {
    const view = location.hash.slice(1).split("/")[0] || "overview"
    if (view === last) return
    last = view
    track("app_demo_view", { view })
  }
  window.addEventListener("hashchange", send)
  send()
}
