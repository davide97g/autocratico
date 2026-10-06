import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useI18n } from "@/i18n"
import { DEMO_MESSAGES } from "@/i18n/demo"
import {
  analyticsEnabled,
  apply,
  type Choice,
  choose,
  storedChoice,
  trackViews,
} from "@/demo/analytics"

const PRIVACY_URL = `${__DEMO_SITE_URL__.replace(/\/+$/, "")}/privacy.html`

/** Asks once whether visits may be counted; nothing loads before a yes. */
export function Consent() {
  const { locale } = useI18n()
  const d = DEMO_MESSAGES[locale]
  const [ask, setAsk] = React.useState(() => analyticsEnabled() && !storedChoice())

  React.useEffect(() => {
    const choice = analyticsEnabled() ? storedChoice() : null
    if (!choice) return
    apply(choice)
    trackViews()
  }, [])

  if (!ask) return null
  const decide = (c: Choice) => {
    choose(c)
    if (c === "granted") trackViews()
    setAsk(false)
  }
  return (
    <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 flex justify-center px-gutter lg:inset-x-auto lg:top-auto lg:right-6 lg:bottom-6">
      <Card
        size="sm"
        className="rise-in w-full max-w-sm rounded-xl shadow-2xl"
        role="dialog"
        aria-label={d.consentTitle}
      >
        <CardHeader>
          <CardTitle>{d.consentTitle}</CardTitle>
          <CardDescription className="leading-relaxed">
            {d.consentBody}{" "}
            <a
              href={PRIVACY_URL}
              target="_blank"
              rel="noopener"
              className="underline underline-offset-2"
            >
              {d.privacy}
            </a>
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => decide("denied")}>
            {d.consentNo}
          </Button>
          <Button size="sm" onClick={() => decide("granted")}>
            {d.consentYes}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
