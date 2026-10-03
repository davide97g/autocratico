// Google Analytics 4, loaded only after the visitor says yes (Garante cookie guidelines, 2021):
// before a choice, and after a no, no Google script runs and no cookie is set. The choice lasts six
// months, then the banner asks again. Without GA_MEASUREMENT_ID at build time there is no banner at all.
//
// Events never carry what people type (chat questions, emails): only fixed names and categories.

declare const __GA_ID__: string

type Params = Record<string, string | number | boolean | undefined>
type Choice = "granted" | "denied"

const GA_ID = __GA_ID__
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

function gtag(..._args: unknown[]) {
  // gtag.js reads the `arguments` object, not an array: keep the function form.
  window.dataLayer!.push(arguments)
}

/** Sends a GA4 event; a no-op without consent. */
export function track(name: string, params: Params = {}) {
  if (granted && loaded) gtag("event", name, params)
}

function stored(): Choice | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as { analytics?: Choice; at?: number } | null
    if (!v?.analytics || typeof v.at !== "number" || Date.now() - v.at > ASK_AGAIN_MS) return null
    return v.analytics
  } catch {
    return null
  }
}

function remember(choice: Choice) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ analytics: choice, at: Date.now() }))
  } catch {
    // private mode: the banner shows again next visit
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
  })
  const s = document.createElement("script")
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`
  document.head.append(s)
  trackSections()
}

/** Stops GA and removes its cookies (_ga, _ga_<id>) on this host and its parent domains. */
function unload() {
  window[`ga-disable-${GA_ID}`] = true
  if (loaded) gtag("consent", "update", { analytics_storage: "denied" })
  const names = document.cookie
    .split(";")
    .map((c) => c.split("=")[0].trim())
    .filter((n) => n === "_ga" || n.startsWith("_ga_") || n === "_gid")
  const parts = location.hostname.split(".")
  const domains = [""]
  for (let i = 0; i < parts.length - 1; i++) domains.push(`; domain=.${parts.slice(i).join(".")}`)
  for (const n of names) for (const d of domains) document.cookie = `${n}=; max-age=0; path=/${d}`
}

function apply(choice: Choice) {
  granted = choice === "granted"
  if (granted) load()
  else unload()
}

/** Section the element sits in, for the `location` parameter. */
export function where(el: Element): string {
  if (el.closest("header")) return "nav"
  if (el.closest("footer")) return "footer"
  if (el.closest("#consent")) return "consent"
  const s = el.closest("section")
  return s ? sectionName(s) : "page"
}

function sectionName(s: Element): string {
  return s.id || s.getAttribute("aria-labelledby")?.replace(/-title$/, "") || "section"
}

/** Clicks on outbound links and on elements marked with data-track="name". */
function trackClicks() {
  document.addEventListener(
    "click",
    (e) => {
      const el = (e.target as Element).closest<HTMLElement>("a[href], [data-track]")
      if (!el) return
      const cta = el.dataset.track
      const href = el instanceof HTMLAnchorElement ? el.href : ""
      let url: URL | null = null
      try {
        url = href ? new URL(href) : null
      } catch {
        url = null
      }
      const location_ = where(el)
      if (url && /^https?:$/.test(url.protocol) && url.origin !== window.location.origin) {
        track("outbound_click", {
          link_url: url.href,
          link_domain: url.hostname,
          link_text: el.textContent?.trim().slice(0, 80),
          cta,
          location: location_,
        })
      } else if (cta) {
        track("cta_click", { cta, location: location_, link_url: url?.hash || undefined })
      }
    },
    { capture: true },
  )
}

/** One section_view per section, the first time it crosses the middle of the screen (starts with consent). */
function trackSections() {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        io.unobserve(e.target)
        track("section_view", { section: sectionName(e.target) })
      }
    },
    { rootMargin: "-45% 0px -45% 0px" },
  )
  document.querySelectorAll("main > section").forEach((s) => io.observe(s))
}

/** FAQ entries opened (toggle does not bubble: listen in the capture phase). */
function trackFaq() {
  document.addEventListener(
    "toggle",
    (e) => {
      const d = e.target
      if (!(d instanceof HTMLDetailsElement) || !d.open) return
      track("faq_open", { question: d.querySelector("summary")?.textContent?.trim().slice(0, 100) })
    },
    { capture: true },
  )
}

export function initAnalytics() {
  const banner = document.querySelector<HTMLElement>("#consent")
  const prefs = document.querySelector<HTMLButtonElement>("#cookie-prefs")
  if (!GA_ID || !banner) {
    if (prefs) prefs.hidden = true
    return
  }

  const show = () => {
    banner.hidden = false
    requestAnimationFrame(() => banner.classList.add("is-in"))
  }
  const choose = (choice: Choice) => {
    remember(choice)
    apply(choice)
    banner.classList.remove("is-in")
    banner.hidden = true
    if (choice === "granted") track("consent_granted")
  }
  banner.querySelector("[data-consent=granted]")?.addEventListener("click", () => choose("granted"))
  banner.querySelector("[data-consent=denied]")?.addEventListener("click", () => choose("denied"))
  prefs?.addEventListener("click", show)

  trackClicks()
  trackFaq()

  const choice = stored()
  if (choice) apply(choice)
  else show()
}
