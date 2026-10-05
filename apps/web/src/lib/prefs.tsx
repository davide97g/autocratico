import * as React from "react"

/** Interface preferences, per device (Settings → Interface). */
export type Prefs = {
  /** Fewer animations, whatever the system says. */
  reduceMotion: boolean
  /** The logo animation when the app opens. */
  splash: boolean
  /** A notice when the agent finishes or the register changes from elsewhere. */
  liveNotices: boolean
  /** Sidebar reduced to icons. */
  compact: boolean
}

const DEFAULTS: Prefs = { reduceMotion: false, splash: true, liveNotices: true, compact: false }
const STORAGE_KEY = "autocratico.prefs"
// Before the preferences had their own key the sidebar remembered itself here.
const LEGACY_COMPACT = "autocratico.sidebar-compact"

function read(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Prefs> | null
    if (saved) return { ...DEFAULTS, ...saved }
    return { ...DEFAULTS, compact: localStorage.getItem(LEGACY_COMPACT) === "1" }
  } catch {
    return DEFAULTS
  }
}

type PrefsState = { prefs: Prefs; set: <K extends keyof Prefs>(key: K, value: Prefs[K] | ((before: Prefs[K]) => Prefs[K])) => void }

const PrefsContext = React.createContext<PrefsState | null>(null)

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = React.useState<Prefs>(read)

  const set = React.useCallback<PrefsState["set"]>((key, value) => {
    setPrefs((before) => {
      const v = typeof value === "function" ? (value as (b: Prefs[typeof key]) => Prefs[typeof key])(before[key]) : value
      const next = { ...before, [key]: v }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // storage unavailable: keep it in memory only
      }
      return next
    })
  }, [])

  // CSS reads it to drop animations (index.css), next to prefers-reduced-motion.
  React.useEffect(() => {
    document.documentElement.toggleAttribute("data-reduce-motion", prefs.reduceMotion)
  }, [prefs.reduceMotion])

  const value = React.useMemo(() => ({ prefs, set }), [prefs, set])
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
}

export function usePrefs() {
  const value = React.useContext(PrefsContext)
  if (!value) throw new Error("usePrefs must be used inside PrefsProvider")
  return value
}

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)"

/** True when animations should be skipped: the system asks for it, or the user did in Settings. */
export function useReducedMotion() {
  const system = React.useSyncExternalStore(
    (notify) => {
      const m = window.matchMedia(REDUCED_QUERY)
      m.addEventListener("change", notify)
      return () => m.removeEventListener("change", notify)
    },
    () => window.matchMedia(REDUCED_QUERY).matches
  )
  const { prefs } = usePrefs()
  return system || prefs.reduceMotion
}
