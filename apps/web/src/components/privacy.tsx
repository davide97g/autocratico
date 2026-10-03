import * as React from "react"
import { cn } from "cn"

import { useI18n } from "@/i18n"

const STORAGE_KEY = "autocratico.privacy"

type PrivacyState = { enabled: boolean; setEnabled: (v: boolean | ((before: boolean) => boolean)) => void }

const PrivacyContext = React.createContext<PrivacyState>({
  enabled: false,
  setEnabled: () => {},
})

function read() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

/** Privacy mode: hides personal data so the app can be shown or screenshotted. */
export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = React.useState(read)

  const setEnabled = React.useCallback((v: boolean | ((before: boolean) => boolean)) => {
    setEnabledState((before) => {
      const next = typeof v === "function" ? v(before) : v
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0")
      } catch {
        // storage unavailable: keep it in memory only
      }
      return next
    })
  }, [])

  return <PrivacyContext.Provider value={{ enabled, setEnabled }}>{children}</PrivacyContext.Provider>
}

export function usePrivacy() {
  return React.useContext(PrivacyContext)
}

/** Personal data: in privacy mode it becomes a solid bar. */
export function Sensitive({
  children,
  when = true,
  className,
}: {
  children: React.ReactNode
  when?: boolean
  className?: string
}) {
  const { enabled } = usePrivacy()
  const { t } = useI18n()
  const hidden = enabled && when
  return (
    <span
      data-redacted={hidden || undefined}
      aria-label={hidden ? t.privacy.hidden : undefined}
      className={cn("rounded-sm transition-colors data-redacted:bg-current data-redacted:select-none", className)}
    >
      <span className={cn(hidden && "invisible")}>{children}</span>
    </span>
  )
}
