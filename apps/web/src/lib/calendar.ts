import { CALENDAR_REDIRECT_PATH } from "@autocratico/core"

import { completeCalendar } from "@/lib/api"

let returned: string | null = null
let finishing: Promise<{ name: string; address: string }> | null = null

/**
 * Back from Google's sign-in for a calendar ("Web application" client): keep the address for
 * Settings, which finishes the sign-in, and drop the one-time code from the address bar.
 * Called once, before the app renders (like captureGmailReturn).
 */
export function captureCalendarReturn() {
  if (window.location.pathname !== CALENDAR_REDIRECT_PATH) return
  returned = window.location.href
  window.history.replaceState(null, "", "/#settings")
}

export const hasCalendarReturn = () => returned !== null || finishing !== null

/** Finishes the sign-in once, however many times it is asked (effects run twice in development). */
export function finishCalendarReturn() {
  if (!finishing && returned) {
    finishing = completeCalendar(returned)
    returned = null
    void finishing.then(
      () => setTimeout(() => (finishing = null), 1000),
      () => setTimeout(() => (finishing = null), 1000)
    )
  }
  return finishing
}
