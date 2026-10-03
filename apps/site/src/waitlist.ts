// Waitlist form: posts to the waitlist service (apps/waitlist), which nginx serves at /api/waitlist.
import { track } from "./analytics.ts"

const MESSAGES: Record<string, (domain: string) => string> = {
  invalid: () => "Questo indirizzo non sembra valido. Controlla di averlo scritto bene.",
  domain: (d) => `Il dominio ${d} non riceve email. Controlla di averlo scritto bene.`,
  typo: (d) => `${d} sembra un errore di battitura. Intendevi gmail.com, libero.it, outlook.com…?`,
  disposable: () => "Gli indirizzi usa e getta scadono prima che ti scriviamo. Usa la tua email di tutti i giorni.",
  placeholder: () => "Sembra un indirizzo di prova. Usa la tua email vera: serve solo per avvisarti.",
  rate: () => "Troppi tentativi. Riprova tra qualche minuto.",
  server: () => "Non riesco a salvarla adesso. Riprova tra poco.",
}

const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]

function source(): Record<string, string> {
  const out: Record<string, string> = {}
  const q = new URLSearchParams(location.search)
  for (const k of UTM) {
    const v = q.get(k)
    if (v) out[k] = v.slice(0, 120)
  }
  try {
    const ref = document.referrer ? new URL(document.referrer).hostname : ""
    if (ref && ref !== location.hostname) out.ref = ref
  } catch {
    // no referrer
  }
  return out
}

export function initWaitlist() {
  const form = document.querySelector<HTMLFormElement>("#wl-form")
  if (!form) return
  const email = form.querySelector<HTMLInputElement>("#wl-email")!
  const consent = form.querySelector<HTMLInputElement>("#wl-consent")!
  const honeypot = form.querySelector<HTMLInputElement>("#wl-website")!
  const button = form.querySelector<HTMLButtonElement>("button[type=submit]")!
  const label = button.querySelector("span")!
  const status = document.querySelector<HTMLElement>("#wl-status")!
  const done = document.querySelector<HTMLElement>("#wl-done")!

  let started = false
  form.addEventListener("focusin", () => {
    if (started) return
    started = true
    track("waitlist_start")
  })

  const say = (text: string, kind: "error" | "info" = "error") => {
    status.textContent = text
    status.dataset.kind = kind
    email.setAttribute("aria-invalid", String(kind === "error" && text !== ""))
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault()
    if (button.disabled) return
    say("", "info")
    if (!form.reportValidity()) return

    button.disabled = true
    label.textContent = "Controllo…"
    const domain = email.value.trim().split("@").pop()?.toLowerCase() ?? ""
    let error = "server"
    try {
      const res = await fetch(new URL("api/waitlist", document.baseURI), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.value,
          consent: consent.checked,
          website: honeypot.value || undefined,
          locale: navigator.language.slice(0, 16),
          source: source(),
        }),
      })
      if (res.ok) {
        track("generate_lead", { method: "waitlist" })
        form.hidden = true
        done.hidden = false
        done.focus()
        return
      }
      error = res.status === 429 ? "rate" : ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "server"
      if (!(error in MESSAGES)) error = "server"
    } catch {
      error = "server"
    } finally {
      button.disabled = false
      label.textContent = "Avvisami"
    }
    track("waitlist_error", { reason: error })
    say(MESSAGES[error](`@${domain}`))
    email.focus()
  })
}
