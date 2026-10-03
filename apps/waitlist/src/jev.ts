// Jev (TypeSafe System One) judges what syntax and DNS cannot: whether a well-formed address on a
// real domain is still junk. Three independent yes/no questions in one request; code owns the policy.
// API: https://docs.typesafe.ai/api.md

const ENDPOINT = "https://api.typesafe.ai/v1/systemone"

export interface Judgment {
  /** Probability the address is a placeholder or fake typed to get past the form. */
  placeholder: number
  /** Probability the domain is a disposable, self-destructing inbox service. */
  disposable: number
  /** Probability the domain is a misspelling of a common mail provider. */
  typo: number
}

const QUESTIONS = {
  placeholder: {
    type: "noul",
    instructions:
      "Is `email` a fake or placeholder address typed only to get past a sign-up form, rather than an inbox a real person reads?",
    criteria: {
      true: "Keyboard mashing (asdf@asdf.com, qwerty@xyz.it), test or example addresses (test@test.com, prova@prova.it, a@b.co, foo@example.org), joke, insulting or nonsense addresses, or addresses pretending to belong to the site itself.",
      false:
        "Plausibly someone's real inbox: a name, nickname, initials, numbers or a role address on a personal, company or public mail provider, even if unusual.",
    },
  },
  disposable: {
    type: "noul",
    instructions:
      "Does `domain` belong to a disposable or temporary email service, whose inboxes are public or self-destruct after minutes or days?",
    criteria: {
      true: "Throwaway inbox services such as mailinator.com, 10minutemail.com, guerrillamail.com, yopmail.com, temp-mail.org, or their many alias domains.",
      false: "Regular mail providers (gmail.com, outlook.com, libero.it, proton.me, icloud.com), ISPs, companies, schools, public bodies or personal domains.",
    },
  },
  typo: {
    type: "noul",
    instructions: "Is `domain` a misspelling of a common email provider's domain, so mail sent there would never reach the person?",
    criteria: {
      true: "Clear typos of well-known providers, such as gmial.com, gmail.co, gmail.con, hotmial.it, yaho.com, libreo.it, outlok.com.",
      false: "The correct domain of a provider, or any other domain that is not an obvious misspelling of a popular one.",
    },
  },
} as const

export type Judge = (address: { email: string; local: string; domain: string }) => Promise<Judgment | null>

/** Returns null when Jev is unreachable, slow or answers something unexpected: the caller fails open. */
export function jevJudge(apiKey: string, opts: { timeoutMs?: number; model?: string; fetch?: typeof fetch } = {}): Judge {
  const doFetch = opts.fetch ?? fetch
  return async ({ email, local, domain }) => {
    try {
      const res = await doFetch(ENDPOINT, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: opts.model ?? "jev-latest",
          state: { email, local_part: local, domain },
          questions: QUESTIONS,
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 4000),
      })
      if (!res.ok) {
        console.warn(`[waitlist] jev answered ${res.status}`)
        return null
      }
      const body = (await res.json()) as { answers?: Record<string, { noul?: unknown }> }
      const p = (k: keyof Judgment) => {
        const v = body.answers?.[k]?.noul
        return typeof v === "number" && v >= 0 && v <= 1 ? v : null
      }
      const placeholder = p("placeholder")
      const disposable = p("disposable")
      const typo = p("typo")
      if (placeholder === null || disposable === null || typo === null) {
        console.warn("[waitlist] jev answer without the expected nouls")
        return null
      }
      return { placeholder, disposable, typo }
    } catch (e) {
      console.warn(`[waitlist] jev unreachable: ${(e as Error).name}`)
      return null
    }
  }
}

/** Rejection threshold: a wrong "junk" turns away a real person, so only confident answers count. */
export const REJECT_AT = 0.8

export type Verdict = "ok" | "placeholder" | "disposable" | "typo"

export function verdict(j: Judgment | null): Verdict {
  if (!j) return "ok"
  if (j.typo >= REJECT_AT) return "typo"
  if (j.disposable >= REJECT_AT) return "disposable"
  if (j.placeholder >= REJECT_AT) return "placeholder"
  return "ok"
}
