import * as React from "react"

import { en, type Messages } from "./en"
import { it } from "./it"

export type Locale = "en" | "it"

export const LOCALES: { id: Locale; label: string }[] = [
  { id: "en", label: "EN" },
  { id: "it", label: "IT" },
]

const MESSAGES: Record<Locale, Messages> = { en, it }
const TAGS: Record<Locale, string> = { en: "en-GB", it: "it-IT" }
const STORAGE_KEY = "autocratico.locale"

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "en" || saved === "it") return saved
  } catch {
    // storage unavailable: fall back to the browser language
  }
  // The public demo is for an Italian audience: it starts in Italian, the switch stays.
  return __DEMO__ || navigator.language.toLowerCase().startsWith("it") ? "it" : "en"
}

function formats(tag: string) {
  return {
    dayMonth: new Intl.DateTimeFormat(tag, { day: "numeric", month: "short" }),
    dayMonthTime: new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
    monthYear: new Intl.DateTimeFormat(tag, { month: "long", year: "numeric" }),
    monthShort: new Intl.DateTimeFormat(tag, { month: "short" }),
    weekday: new Intl.DateTimeFormat(tag, { weekday: "short" }),
    weekdayLong: new Intl.DateTimeFormat(tag, { weekday: "long" }),
    long: new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric" }),
    short: new Intl.DateTimeFormat(tag, { day: "2-digit", month: "2-digit", year: "2-digit" }),
    euro: new Intl.NumberFormat(tag, { style: "currency", currency: "EUR" }),
    euroShort: new Intl.NumberFormat(tag, { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 }),
    percent: new Intl.NumberFormat(tag, { style: "percent", maximumFractionDigits: 0 }),
    monthShortYear: new Intl.DateTimeFormat(tag, { month: "short", year: "2-digit" }),
    year: new Intl.DateTimeFormat(tag, { year: "numeric" }),
  }
}

type I18n = {
  locale: Locale
  setLocale: (l: Locale) => void
  t: Messages
  fmt: ReturnType<typeof formats>
}

const I18nContext = React.createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>(initialLocale)

  const setLocale = React.useCallback((l: Locale) => {
    setLocaleState(l)
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      // storage unavailable: keep it in memory only
    }
  }, [])

  React.useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const value = React.useMemo(
    () => ({ locale, setLocale, t: MESSAGES[locale], fmt: formats(TAGS[locale]) }),
    [locale, setLocale]
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const value = React.useContext(I18nContext)
  if (!value) throw new Error("useI18n must be used inside I18nProvider")
  return value
}
