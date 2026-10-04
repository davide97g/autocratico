import { GMAIL_REDIRECT_PATH } from "@autocratico/core"

import { completeGmail } from "@/lib/api"

let returned: string | null = null
let finishing: Promise<{ name: string; address: string }> | null = null

/**
 * Back from Google's sign-in (Gmail setup, "Web application" client): keep the address for
 * Settings, which finishes the sign-in, and drop the one-time code from the address bar.
 * Called once, before the app renders.
 */
export function captureGmailReturn() {
  if (window.location.pathname !== GMAIL_REDIRECT_PATH) return
  returned = window.location.href
  window.history.replaceState(null, "", "/#settings")
}

export const hasGmailReturn = () => returned !== null || finishing !== null

/** Finishes the sign-in once, however many times it is asked (effects run twice in development). */
export function finishGmailReturn() {
  if (!finishing && returned) {
    finishing = completeGmail(returned)
    returned = null
    // A failed or finished sign-in is not resumed by a later visit to Settings.
    void finishing.then(
      () => setTimeout(() => (finishing = null), 1000),
      () => setTimeout(() => (finishing = null), 1000)
    )
  }
  return finishing
}
